-- 55_payment_security_hardening.sql
--
-- Production Security Hardening Migration
-- Implements audit findings S-7, S-8, and the concurrency oversell fix.
--
-- Changes:
--   1. `purchase_tickets` now sets ticket status='reserved' (not 'valid')
--      and increments `quantity_reserved` instead of `quantity_sold`.
--   2. `confirm_order_payment` transitions 'reserved' tickets to 'valid'
--      and finalises quantity_reserved → quantity_sold.
--   3. Cancellation path: `release_order_reservation` decrements quantity_reserved.
--   4. `purchase_tickets` uses SELECT FOR UPDATE on ticket_types to prevent oversell
--      under concurrent load.
--   5. `release_expired_reservations` cleanup function for abandoned checkouts.
--
-- Preconditions:
--   • Migration 49 must already be applied (adds p_seat_ids param).
--   • ticket_types table must have a `quantity_reserved` column (added below).
--   • tickets.status enum/check must allow 'reserved' (added below).

-- ─── Schema Prerequisites ─────────────────────────────────────────────────────

-- Add quantity_reserved column to ticket_types if it doesn't exist
ALTER TABLE ticket_types
    ADD COLUMN IF NOT EXISTS quantity_reserved integer NOT NULL DEFAULT 0
        CHECK (quantity_reserved >= 0);

-- Allow 'reserved' as a valid ticket status.
-- The existing check constraint must be updated or the column type changed.
-- We drop and recreate a permissive check to include 'reserved'.
DO $$
BEGIN
    -- Remove old check constraint if it exists by name (adjust name if different)
    -- We use a safe approach: alter the column type pattern for text with check
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
    ALTER TABLE tickets
        ADD CONSTRAINT tickets_status_check
        CHECK (status IN ('reserved', 'valid', 'used', 'refunded', 'cancelled', 'expired'));
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not alter tickets_status_check constraint: %', SQLERRM;
END;
$$;

-- ─── RPC: purchase_tickets (v3 — Security Hardened) ───────────────────────────
-- Replaces the v2 version from 49_fix_purchase_tickets_user_id.sql
-- Key changes:
--   • Uses SELECT FOR UPDATE on ticket_types to prevent overselling
--   • Sets ticket status = 'reserved' (not 'valid') — payment not confirmed yet
--   • Increments quantity_reserved (not quantity_sold)

CREATE OR REPLACE FUNCTION purchase_tickets(
    p_event_id        uuid,
    p_ticket_type_id  uuid,
    p_quantity        int,
    p_attendee_names  text[],
    p_buyer_email     text,
    p_buyer_name      text,
    p_promo_code      text     DEFAULT NULL,
    p_user_id         uuid     DEFAULT NULL,  -- Explicit override for service-role callers
    p_seat_ids        uuid[]   DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_order_id        uuid;
    v_ticket_price    numeric(10,2);
    v_total_amount    numeric(10,2);
    v_organizer_id    uuid;
    v_ticket_id       uuid;
    v_owner_id        uuid;
    v_available       int;
    i                 int;
BEGIN
    -- Resolve owner: explicit p_user_id preferred over auth.uid()
    v_owner_id := COALESCE(p_user_id, auth.uid());

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create tickets: user identity unknown (auth.uid() NULL and no p_user_id provided).';
    END IF;

    -- ── Concurrency-safe inventory check (SELECT FOR UPDATE) ─────────────────
    -- Locks the ticket_type row for the duration of this transaction to prevent
    -- concurrent checkouts from overselling.
    SELECT
        price,
        (quantity_total - quantity_sold - quantity_reserved) AS available
    INTO v_ticket_price, v_available
    FROM ticket_types
    WHERE id = p_ticket_type_id AND event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- If ticket type not found, treat as free (fallback for legacy events)
        v_ticket_price := 0;
        v_available    := p_quantity; -- Assume available; no inventory to check
    ELSIF v_available < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets available. Requested: %, Available: %', p_quantity, v_available;
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found.';
    END IF;

    v_total_amount := v_ticket_price * p_quantity;

    -- ── Create Order ──────────────────────────────────────────────────────────
    INSERT INTO orders (
        user_id, event_id, total_amount, currency, status, metadata
    ) VALUES (
        v_owner_id,
        p_event_id,
        v_total_amount,
        'ZAR',
        'pending',
        jsonb_build_object(
            'buyer_email', p_buyer_email,
            'buyer_name',  p_buyer_name,
            'promo_code',  p_promo_code
        )
    ) RETURNING id INTO v_order_id;

    -- ── Create Tickets (status='reserved', NOT 'valid') ───────────────────────
    -- S-7: Tickets are 'reserved' until payment is confirmed via ITN.
    -- This prevents QR code scanning of unpaid tickets.
    FOR i IN 1..p_quantity LOOP
        INSERT INTO tickets (
            event_id, owner_user_id, status, price, ticket_type_id, metadata
        ) VALUES (
            p_event_id,
            v_owner_id,
            'reserved',     -- S-7: Changed from 'valid' — activated by confirm_order_payment
            v_ticket_price,
            p_ticket_type_id,
            jsonb_build_object('attendee_name', p_attendee_names[i])
        ) RETURNING id INTO v_ticket_id;

        INSERT INTO order_items (order_id, ticket_id, price_at_purchase)
        VALUES (v_order_id, v_ticket_id, v_ticket_price);
    END LOOP;

    -- ── S-8: Increment quantity_reserved (NOT quantity_sold) ──────────────────
    -- quantity_sold is updated only when payment is confirmed.
    UPDATE ticket_types
    SET quantity_reserved = quantity_reserved + p_quantity,
        updated_at        = NOW()
    WHERE id = p_ticket_type_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC: confirm_order_payment (v2 — Security Hardened) ──────────────────────
-- Called from payfast-itn after PayFast confirms COMPLETE status.
-- Key changes:
--   • Transitions tickets from 'reserved' → 'valid'
--   • Moves quantity_reserved → quantity_sold on the ticket_type

CREATE OR REPLACE FUNCTION confirm_order_payment(
    p_order_id    text,
    p_payment_ref text,
    p_provider    text
) RETURNS void AS $$
DECLARE
    v_order         orders%ROWTYPE;
    v_organizer_id  uuid;
    v_ticket_type_id uuid;
    v_ticket_count  int;
    v_order_uuid    uuid;
BEGIN
    v_order_uuid := p_order_id::uuid;

    -- Get Order
    SELECT * INTO v_order FROM orders WHERE id = v_order_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Idempotency: already confirmed
    IF v_order.status = 'paid' THEN
        RETURN;
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = v_order.event_id;

    -- ── Mark Order Paid ───────────────────────────────────────────────────────
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = v_order_uuid;

    -- ── Record Payment ────────────────────────────────────────────────────────
    INSERT INTO payments (
        order_id, provider, provider_tx_id, amount, currency, status
    ) VALUES (
        v_order_uuid,
        p_provider,
        p_payment_ref,
        v_order.total_amount,
        v_order.currency,
        'completed'
    );

    -- ── S-7: Activate Reserved Tickets ───────────────────────────────────────
    UPDATE tickets
    SET status     = 'valid',
        updated_at = NOW()
    WHERE id IN (
        SELECT ticket_id FROM order_items WHERE order_id = v_order_uuid
    )
    AND status = 'reserved';

    -- ── S-8: Finalise Inventory Counts ──────────────────────────────────────
    FOR v_ticket_type_id, v_ticket_count IN
        SELECT tt.ticket_type_id, COUNT(*) AS cnt
        FROM order_items oi
        JOIN tickets tt ON oi.ticket_id = tt.id
        WHERE oi.order_id = v_order_uuid
        GROUP BY tt.ticket_type_id
    LOOP
        UPDATE ticket_types
        SET quantity_sold     = quantity_sold + v_ticket_count,
            quantity_reserved = GREATEST(0, quantity_reserved - v_ticket_count),
            updated_at        = NOW()
        WHERE id = v_ticket_type_id;
    END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC: release_order_reservation ──────────────────────────────────────────
-- Called by payfast-itn when payment fails/cancels, and by the cleanup function
-- for expired reservations. Decrements quantity_reserved and marks tickets expired.

CREATE OR REPLACE FUNCTION release_order_reservation(
    p_order_id uuid
) RETURNS void AS $$
DECLARE
    v_ticket_type_id uuid;
    v_ticket_count   int;
BEGIN
    -- Only release if order is still in pending/cancelled state
    -- (prevent double-release if already paid)
    IF NOT EXISTS (
        SELECT 1 FROM orders
        WHERE id = p_order_id AND status IN ('pending', 'cancelled')
    ) THEN
        RETURN; -- Order was paid or already cleaned up
    END IF;

    -- Expire the reserved tickets
    UPDATE tickets
    SET status     = 'expired',
        updated_at = NOW()
    WHERE id IN (
        SELECT ticket_id FROM order_items WHERE order_id = p_order_id
    )
    AND status = 'reserved';

    -- Decrement quantity_reserved per ticket_type
    FOR v_ticket_type_id, v_ticket_count IN
        SELECT t.ticket_type_id, COUNT(*) AS cnt
        FROM order_items oi
        JOIN tickets t ON oi.ticket_id = t.id
        WHERE oi.order_id = p_order_id
        GROUP BY t.ticket_type_id
    LOOP
        UPDATE ticket_types
        SET quantity_reserved = GREATEST(0, quantity_reserved - v_ticket_count),
            updated_at        = NOW()
        WHERE id = v_ticket_type_id;
    END LOOP;

    -- Mark order as expired
    UPDATE orders
    SET status     = 'expired',
        updated_at = NOW()
    WHERE id = p_order_id AND status IN ('pending', 'cancelled');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC: release_expired_reservations (cleanup job) ─────────────────────────
-- Releases all pending orders older than 30 minutes with no payment.
-- Schedule this via pg_cron: SELECT cron.schedule('*/30 * * * *', $$SELECT release_expired_reservations()$$);
-- Or call it from a Supabase scheduled Edge Function (cron-dynamic-pricing is already an example).

CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS int AS $$
DECLARE
    expired_order_id uuid;
    count_released   int := 0;
BEGIN
    FOR expired_order_id IN
        SELECT id FROM orders
        WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '30 minutes'
    LOOP
        PERFORM release_order_reservation(expired_order_id);
        count_released := count_released + 1;
    END LOOP;

    IF count_released > 0 THEN
        RAISE NOTICE '[release_expired_reservations] Released % expired reservations', count_released;
    END IF;

    RETURN count_released;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Index for expiry cleanup performance ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_pending_created
    ON orders (created_at)
    WHERE status = 'pending';

-- ─── Note: Connection Pooler ──────────────────────────────────────────────────
-- S-13 cannot be fixed via SQL migration. Enable PgBouncer in transaction mode
-- via the Supabase Dashboard: Project Settings → Database → Connection Pooling.
-- Recommended settings: pool_mode=transaction, pool_size=20.
