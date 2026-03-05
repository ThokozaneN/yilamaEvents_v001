-- 63_rate_limiting_and_quantity_cap.sql
--
-- Fixes from the Security & Abuse audit (2026-03-02):
--  A-6.1: Per-user checkout throttle inside purchase_tickets (DB-level rate limit)
--  A-6.2: Max 20 tickets per transaction enforced server-side
--
-- These RPCs also incorporate all prior fixes from migration 62.
-- Run AFTER 62_focused_audit_fixes.sql.

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
    v_order_id       uuid;
    v_ticket_price   numeric(10,2);
    v_total_amount   numeric(10,2);
    v_organizer_id   uuid;
    v_ticket_id      uuid;
    v_owner_id       uuid;
    v_available      int;
    v_recent_orders  int;
    i                int;
BEGIN
    v_owner_id := COALESCE(p_user_id, auth.uid());
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create tickets: user identity unknown.';
    END IF;

    -- A-6.2: Hard cap on quantity per transaction
    IF p_quantity < 1 THEN
        RAISE EXCEPTION 'Quantity must be at least 1.';
    END IF;
    IF p_quantity > 20 THEN
        RAISE EXCEPTION 'Maximum 20 tickets per transaction. Please contact the organizer for bulk orders.';
    END IF;

    -- A-6.1: DB-level rate limit — block if user has 3+ pending orders in last 5 minutes
    -- This prevents spam checkout inventory draining without requiring external rate limiting infra.
    SELECT COUNT(*) INTO v_recent_orders
    FROM orders
    WHERE user_id = v_owner_id
      AND status = 'pending'
      AND created_at > NOW() - INTERVAL '5 minutes';

    IF v_recent_orders >= 3 THEN
        RAISE EXCEPTION 'Too many pending checkouts. Please wait a few minutes or complete an existing order.';
    END IF;

    -- Concurrency-safe inventory check (FOR UPDATE holds the row for this transaction)
    SELECT
        price,
        (quantity_limit - quantity_sold - quantity_reserved) AS available
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


-- Index to accelerate the rate-limit query (pending orders by user + created_at)
-- Already partially covered by idx_orders_user_id + idx_orders_status from migration 29,
-- but a composite partial index makes this specific query near-instant:
CREATE INDEX IF NOT EXISTS idx_orders_pending_user_recent
    ON orders (user_id, created_at DESC)
    WHERE status = 'pending';
