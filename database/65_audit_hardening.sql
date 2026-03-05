-- 65_audit_hardening.sql
--
-- Fixes from 2026-03-02 Production Audit:
--  I-3.3: Replace FOR UPDATE with optimistic UPDATE in purchase_tickets
--  I-3.1: Reduce reservation expiry window from 30min to 15min (cron change is in Dashboard)
--  P-2.3: Add UNIQUE constraint on refunds to prevent double-processing
--  D-5.2: Add index on payments(order_id) for faster refund/ITN lookups
--  A-4.1: Add WITH CHECK to profiles UPDATE policy to prevent role self-escalation
--  D-5.1: release_expired_reservations — reduce expiry to match new 15min window

-- ─── I-3.3: Optimistic Locking in purchase_tickets ───────────────────────────
-- Replace SELECT ... FOR UPDATE (serializing lock) with atomic conditional UPDATE.
-- This avoids row-level lock contention at 50k concurrent users.
-- The UPDATE only succeeds if sufficient inventory exists — atomically.

CREATE OR REPLACE FUNCTION purchase_tickets(
    p_event_id        uuid,
    p_ticket_type_id  uuid,
    p_quantity        int,
    p_attendee_names  text[],
    p_buyer_email     text,
    p_buyer_name      text,
    p_promo_code      text    DEFAULT NULL,
    p_user_id         uuid    DEFAULT NULL,
    p_seat_ids        text[]  DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_owner_id       uuid;
    v_ticket_price   numeric;
    v_total_amount   numeric;
    v_organizer_id   uuid;
    v_order_id       uuid;
    v_ticket_id      uuid;
    v_seat_id        text;
    v_rows_updated   int;
    v_pending_count  int;
    i                int;
BEGIN
    -- Resolve buyer identity
    v_owner_id := COALESCE(p_user_id, auth.uid());
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to purchase tickets.';
    END IF;

    -- A-6.2: Server-side quantity cap (20 per transaction)
    IF p_quantity > 20 THEN
        RAISE EXCEPTION 'Maximum 20 tickets per transaction. Requested: %', p_quantity;
    END IF;
    IF p_quantity < 1 THEN
        RAISE EXCEPTION 'Quantity must be at least 1.';
    END IF;

    -- A-6.1: DB-level rate limiting — max 3 pending orders per 5 minutes per user
    SELECT COUNT(*) INTO v_pending_count
    FROM orders
    WHERE user_id = v_owner_id
      AND status  = 'pending'
      AND created_at > NOW() - INTERVAL '5 minutes';

    IF v_pending_count >= 3 THEN
        RAISE EXCEPTION 'Too many pending orders. Please complete or cancel existing orders before starting a new checkout.';
    END IF;

    -- ── I-3.3: Optimistic inventory update (replaces SELECT FOR UPDATE) ──────
    -- Atomically decrement quantity_sold only if sufficient inventory exists.
    -- If 0 rows updated → sold out (no lock contention, scales to any concurrency).
    UPDATE ticket_types
    SET quantity_sold = quantity_sold + p_quantity
    WHERE id    = p_ticket_type_id
      AND event_id = p_event_id
      AND (quantity_limit - quantity_sold - COALESCE(quantity_reserved, 0)) >= p_quantity
    RETURNING price INTO v_ticket_price;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
        -- Either ticket_type not found, OR not enough inventory
        IF NOT EXISTS (SELECT 1 FROM ticket_types WHERE id = p_ticket_type_id AND event_id = p_event_id) THEN
            RAISE EXCEPTION 'Ticket type not found for this event.';
        ELSE
            RAISE EXCEPTION 'Not enough tickets available. They may have just sold out.';
        END IF;
    END IF;

    -- Get organizer for fee calculation
    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        -- Rollback the optimistic decrement
        UPDATE ticket_types SET quantity_sold = quantity_sold - p_quantity WHERE id = p_ticket_type_id;
        RAISE EXCEPTION 'Event not found.';
    END IF;

    -- Create the order and items within a rollback block
    BEGIN
        v_total_amount := v_ticket_price * p_quantity;

        INSERT INTO orders (
            user_id, event_id, total_amount, currency, status, metadata
        ) VALUES (
            v_owner_id, p_event_id, v_total_amount, 'ZAR', 'pending',
            jsonb_build_object(
                'buyer_email', p_buyer_email,
                'buyer_name',  p_buyer_name,
                'promo_code',  p_promo_code
            )
        ) RETURNING id INTO v_order_id;

        FOR i IN 1..p_quantity LOOP
            v_seat_id := CASE WHEN p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) >= i THEN p_seat_ids[i] ELSE NULL END;

            INSERT INTO tickets (
                event_id, ticket_type_id, owner_user_id, attendee_name, status, seat_id
            ) VALUES (
                p_event_id, p_ticket_type_id, v_owner_id,
                COALESCE(p_attendee_names[i], p_buyer_name),
                'pending',
                v_seat_id
            ) RETURNING id INTO v_ticket_id;

            INSERT INTO order_items (order_id, ticket_id, price_at_purchase)
            VALUES (v_order_id, v_ticket_id, v_ticket_price);
        END LOOP;
        
        RETURN v_order_id;
    EXCEPTION WHEN OTHERS THEN
        -- Revert the optimistic inventory decrement on any subsequent failure
        UPDATE ticket_types SET quantity_sold = quantity_sold - p_quantity WHERE id = p_ticket_type_id;
        RAISE EXCEPTION 'Failed to create order or tickets. Inventory has been restored. Error: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── I-3.1: Reduce expiry window from 30min to 15min ────────────────────────
-- The cron interval itself must be changed in Supabase Dashboard:
-- Edge Functions → cron-release-reservations → Schedules → change to */5 * * * *
-- This migration reduces the SQL expiry threshold to align with the new 5-min cron.
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS int AS $$
DECLARE
    expired_order_id uuid;
    count_released   int := 0;
BEGIN
    FOR expired_order_id IN
        SELECT id FROM orders
        WHERE status = 'pending'
          -- I-3.1: Reduced from 30min to 15min expiry window
          AND created_at < NOW() - INTERVAL '15 minutes'
    LOOP
        PERFORM release_order_reservation(expired_order_id);
        count_released := count_released + 1;
    END LOOP;

    IF count_released > 0 THEN
        RAISE NOTICE '[release_expired_reservations] Released % expired reservations', count_released;
    END IF;

    RETURN count_released;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── P-2.3: Prevent refund double-processing ─────────────────────────────────
-- Add unique constraint: one refund per (payment, ticket). Prevents race condition
-- where a retry creates a second refund record and fires PayFast API twice.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_refund_per_payment_item') THEN
        ALTER TABLE refunds
            ADD CONSTRAINT unique_refund_per_payment_item
            UNIQUE (payment_id, item_id);
    END IF;
END $$;


-- ─── D-5.2: Index on payments(order_id) ──────────────────────────────────────
-- process-refund queries payments WHERE order_id = X. Under high volume this
-- becomes a sequential scan without this index.
CREATE INDEX IF NOT EXISTS idx_payments_order_id
    ON payments (order_id);

-- Also create a covering index for the common ITN lookup pattern:
-- payfast-itn looks up by provider_tx_id (already unique), but let's be sure
CREATE INDEX IF NOT EXISTS idx_payments_provider_tx
    ON payments (provider_tx_id);


-- ─── A-4.1: Prevent role self-escalation via profile UPDATE ──────────────────
-- Without this, a user could PATCH their own profile and set role = 'organizer',
-- bypassing the organizer verification workflow entirely.

-- Drop existing update policy if any
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Recreate with WITH CHECK that prevents role change
CREATE POLICY "Users update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id
    -- Role must remain unchanged — user cannot self-promote
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
);

-- Admins retain full UPDATE ability
DROP POLICY IF EXISTS "Admins update any profile" ON profiles;
CREATE POLICY "Admins update any profile"
ON profiles FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
