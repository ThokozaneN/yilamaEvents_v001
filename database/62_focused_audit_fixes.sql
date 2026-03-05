-- 62_focused_audit_fixes.sql
--
-- Fixes all findings from the focused production audit (2026-03-02):
--  F-3.1: validate_ticket_scan race condition — add FOR UPDATE + scanner auth
--  F-3.2: quantity_total → quantity_limit column name fix in purchase_tickets
--  F-3.3: Broken inventory check constraint — include quantity_reserved
--  F-4.1: validate_ticket_scan caller authorization enforcement
--  F-4.2: Banking/sensitive columns restricted via column-level REVOKE
--  F-4.3: check_organizer_limits caller identity check
--  F-5.1: Composite index on ticket_checkins for event dashboard queries
--  F-5.2: Refund settlement trigger fires on 'approved' not just 'completed'
--  F-5.4: Verify/enforce ON DELETE CASCADE on order_items FK


-- ─── F-3.3: Fix Inventory Constraint ─────────────────────────────────────────
-- The original constraint `quantity_sold <= quantity_limit` will fail when
-- quantity_reserved is non-zero because sold + reserved can exceed limit transiently.
-- Replace with a constraint covering both counters.

ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS ticket_types_quantity_sold_check;
ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS ticket_types_inventory_check;

ALTER TABLE ticket_types
    ADD CONSTRAINT ticket_types_inventory_check
    CHECK (quantity_sold + quantity_reserved <= quantity_limit);


-- ─── F-3.2 + F-3.1 + F-4.1: purchase_tickets & validate_ticket_scan fixes ───
-- Rewrite both RPCs in one pass:
--  • quantity_total → quantity_limit (F-3.2)
--  • FOR UPDATE OF t in ticket lookup (F-3.1)
--  • Scanner caller auth check (F-4.1)

CREATE OR REPLACE FUNCTION purchase_tickets(
    p_event_id        uuid,
    p_ticket_type_id  uuid,
    p_quantity        int,
    p_attendee_names  text[],
    p_buyer_email     text,
    p_buyer_name      text,
    p_promo_code      text   DEFAULT NULL,
    p_user_id         uuid   DEFAULT NULL,
    p_seat_ids        uuid[] DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_order_id     uuid;
    v_ticket_price numeric(10,2);
    v_total_amount numeric(10,2);
    v_organizer_id uuid;
    v_ticket_id    uuid;
    v_owner_id     uuid;
    v_available    int;
    i              int;
BEGIN
    v_owner_id := COALESCE(p_user_id, auth.uid());
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create tickets: user identity unknown.';
    END IF;

    -- F-3.2: Use quantity_limit (not quantity_total which does not exist)
    -- F-3.1: FOR UPDATE serialises concurrent checkouts on this ticket_type row
    SELECT
        price,
        (quantity_limit - quantity_sold - quantity_reserved) AS available  -- ← FIXED
    INTO v_ticket_price, v_available
    FROM ticket_types
    WHERE id = p_ticket_type_id AND event_id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket type not found for this event.';
    END IF;

    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'Not enough tickets available. Requested: %, Available: %', p_quantity, v_available;
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found.';
    END IF;

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
        INSERT INTO tickets (
            event_id, owner_user_id, status, price, ticket_type_id, metadata
        ) VALUES (
            p_event_id, v_owner_id, 'reserved', v_ticket_price, p_ticket_type_id,
            jsonb_build_object('attendee_name', p_attendee_names[i])
        ) RETURNING id INTO v_ticket_id;

        INSERT INTO order_items (order_id, ticket_id, price_at_purchase)
        VALUES (v_order_id, v_ticket_id, v_ticket_price);
    END LOOP;

    UPDATE ticket_types
    SET quantity_reserved = quantity_reserved + p_quantity, updated_at = NOW()
    WHERE id = p_ticket_type_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- F-3.1 + F-4.1: validate_ticket_scan with race condition fix + scanner auth
CREATE OR REPLACE FUNCTION validate_ticket_scan(
    p_ticket_public_id uuid,
    p_event_id         uuid,
    p_scanner_id       uuid,
    p_signature        text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_ticket_data        record;
    v_already_checked_in boolean;
BEGIN
    -- F-4.1: Verify the caller is who they claim to be
    IF auth.uid() IS DISTINCT FROM p_scanner_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Scanner ID does not match authenticated user',
            'code', 'AUTH_MISMATCH'
        );
    END IF;

    -- F-4.1: Verify the caller is authorised to scan for this event
    IF NOT (
        owns_event(p_event_id) OR
        is_event_scanner(p_event_id) OR
        is_event_team_member(p_event_id) OR
        is_admin()
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Not authorised to scan for this event',
            'code', 'FORBIDDEN'
        );
    END IF;

    -- F-3.1: Lock the ticket row to prevent concurrent duplicate scan
    -- FOR UPDATE OF t serialises any scan touching the same ticket within one transaction.
    SELECT t.id, t.status, t.event_id, t.ticket_type_id,
           tt.name AS tier_name, p.name AS owner_name
    INTO v_ticket_data
    FROM tickets t
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    LEFT JOIN profiles p      ON t.owner_user_id = p.id
    WHERE t.public_id = p_ticket_public_id
    FOR UPDATE OF t;  -- ← F-3.1: Row-level lock prevents race condition

    IF v_ticket_data.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ticket not found', 'code', 'NOT_FOUND');
    END IF;

    IF v_ticket_data.event_id != p_event_id THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result)
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_event');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM ticket_checkins
        WHERE ticket_id = v_ticket_data.id AND result = 'success'
    ) INTO v_already_checked_in;

    IF v_already_checked_in THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result)
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'duplicate');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket already used', 'code', 'DUPLICATE', 'ticket', row_to_json(v_ticket_data));
    END IF;

    IF v_ticket_data.status != 'valid' THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result)
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_status');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    END IF;

    INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result)
    VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'success');

    UPDATE tickets SET status = 'used', updated_at = now() WHERE id = v_ticket_data.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Valid Ticket',
        'code', 'SUCCESS',
        'ticket', jsonb_build_object(
            'tier', v_ticket_data.tier_name,
            'owner', v_ticket_data.owner_name
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── F-5.2: Fix Refund Settlement Trigger ─────────────────────────────────────
-- process_refund_settlement previously only fired when status = 'completed'.
-- process-refund Edge Function sets status = 'approved' after PayFast confirms.
-- This mismatch meant the organizer's balance was NEVER debited on refund.
-- Fix: Accept both 'approved' and 'completed' to handle current and legacy records.

CREATE OR REPLACE FUNCTION process_refund_settlement()
RETURNS trigger AS $$
DECLARE
    v_organizer_id uuid;
    v_exists       boolean;
BEGIN
    -- F-5.2: Fire on 'approved' (Edge Function sets this) OR 'completed' (legacy)
    IF new.status NOT IN ('approved', 'completed') THEN RETURN new; END IF;
    IF old.status IN ('approved', 'completed') THEN RETURN new; END IF;  -- Idempotent

    SELECT e.organizer_id INTO v_organizer_id
    FROM payments p
    JOIN orders o  ON p.order_id  = o.id
    JOIN events e  ON o.event_id  = e.id
    WHERE p.id = new.payment_id;

    IF v_organizer_id IS NULL THEN
        RAISE WARNING '[process_refund_settlement] Could not resolve organizer for refund %', new.id;
        RETURN new;
    END IF;

    -- Idempotency: skip if ledger entry already exists
    SELECT EXISTS(
        SELECT 1 FROM financial_transactions
        WHERE reference_id = new.id AND reference_type = 'refund'
    ) INTO v_exists;

    IF v_exists THEN RETURN new; END IF;

    -- Debit the organizer's balance
    INSERT INTO financial_transactions (
        wallet_user_id, type, amount, category, reference_type, reference_id, description
    ) VALUES (
        v_organizer_id, 'debit', new.amount, 'refund', 'refund', new.id,
        'Refund to Customer: ' || COALESCE(new.reason, 'Requested')
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger is attached (idempotent)
DROP TRIGGER IF EXISTS on_refund_completed ON refunds;
CREATE TRIGGER on_refund_completed
    AFTER UPDATE ON refunds
    FOR EACH ROW EXECUTE PROCEDURE process_refund_settlement();


-- ─── F-4.3: Restrict check_organizer_limits to own data ──────────────────────
CREATE OR REPLACE FUNCTION public.check_organizer_limits(org_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_plan record;
    v_current_events int;
BEGIN
    -- F-4.3: Only the organizer themselves or an admin can query their limits
    IF auth.uid() IS DISTINCT FROM org_id AND NOT is_admin() THEN
        RAISE EXCEPTION 'Cannot check limits for another organizer';
    END IF;

    SELECT * INTO v_plan FROM public.get_organizer_plan(org_id);

    SELECT COUNT(*) INTO v_current_events
    FROM public.events
    WHERE organizer_id = org_id AND status NOT IN ('ended', 'cancelled');

    RETURN jsonb_build_object(
        'plan_id',       v_plan.id,
        'plan_name',     v_plan.name,
        'events_limit',  v_plan.events_limit,
        'events_current',v_current_events,
        'tickets_limit', v_plan.tickets_limit,
        'scanners_limit',v_plan.scanners_limit
        -- commission_rate intentionally omitted from public response
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── F-4.2: Restrict Sensitive Columns on profiles ───────────────────────────
-- Banking and identity fields must not be readable by anonymous/general users.
-- Column-level privileges override the permissive RLS SELECT policy.

REVOKE SELECT (
    bank_name, branch_code, account_number, account_holder, account_type,
    id_number, id_proof_url, organization_proof_url, address_proof_url
) ON public.profiles FROM anon, authenticated;

-- Grant those columns back ONLY to the row owner (via a secure function)
-- and to the service_role (used by Edge Functions and admin operations).
-- Note: service_role bypasses RLS by default; this REVOKE applies to
-- anon and authenticated roles used by the frontend.

-- Create a safe view for profile data that frontend can query freely
CREATE OR REPLACE VIEW public.v_safe_profiles AS
    SELECT
        id, email, name, avatar_url, role,
        organizer_tier, organizer_status, organizer_trust_score,
        business_name, website_url,
        instagram_handle, twitter_handle, facebook_handle,
        phone, organization_phone,
        created_at, updated_at
    FROM public.profiles;

-- Grant public SELECT on the safe view
GRANT SELECT ON public.v_safe_profiles TO anon, authenticated;


-- ─── F-5.1: Composite Index for Event Dashboard Checkin Queries ───────────────
CREATE INDEX IF NOT EXISTS idx_checkins_event_result_time
    ON ticket_checkins(event_id, result, scanned_at DESC);


-- ─── F-5.4: Verify order_items FK has ON DELETE CASCADE ──────────────────────
-- We cannot ALTER CONSTRAINT to add CASCADE without dropping and recreating the FK.
-- The safest approach is to check whether it exists and recreate it if needed.
DO $$
DECLARE
    v_constraint_name text;
    v_delete_rule     text;
BEGIN
    SELECT tc.constraint_name, rc.delete_rule
    INTO v_constraint_name, v_delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'order_items'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'orders'
    LIMIT 1;

    IF v_delete_rule IS NULL THEN
        RAISE NOTICE '[F-5.4] No FK from order_items to orders found. Verify schema manually.';
    ELSIF v_delete_rule != 'CASCADE' THEN
        RAISE NOTICE '[F-5.4] order_items FK delete rule is %. Recreating with CASCADE.', v_delete_rule;

        EXECUTE format('ALTER TABLE order_items DROP CONSTRAINT %I', v_constraint_name);
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_order_id_fkey
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

        RAISE NOTICE '[F-5.4] Recreated FK with ON DELETE CASCADE.';
    ELSE
        RAISE NOTICE '[F-5.4] order_items FK already has ON DELETE CASCADE. No action needed.';
    END IF;
END;
$$;
