-- 32_purchase_tickets_rpc.sql
-- Function to purchase tickets (creates order and generates tickets)
CREATE OR REPLACE FUNCTION purchase_tickets(
    p_event_id uuid,
    p_ticket_type_id uuid,
    p_quantity int,
    p_attendee_names text[],
    p_buyer_email text,
    p_buyer_name text,
    p_promo_code text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_order_id uuid;
    v_ticket_price numeric(10,2);
    v_total_amount numeric(10,2);
    v_organizer_id uuid;
    v_ticket_id uuid;
    i int;
BEGIN
    -- 1. Get Ticket Price and Organizer
    SELECT price INTO v_ticket_price FROM ticket_types WHERE id = p_ticket_type_id AND event_id = p_event_id;
    IF NOT FOUND THEN
        -- Fallback if no specific tier, assuming it's a free generic event
        v_ticket_price := 0;
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found.';
    END IF;

    -- Calculate total
    v_total_amount := v_ticket_price * p_quantity;

    -- 2. Create Order
    INSERT INTO orders (
        user_id,
        event_id,
        total_amount,
        currency,
        status,
        metadata
    ) VALUES (
        auth.uid(),
        p_event_id,
        v_total_amount,
        'ZAR',
        'pending',
        jsonb_build_object(
            'buyer_email', p_buyer_email,
            'buyer_name', p_buyer_name,
            'promo_code', p_promo_code
        )
    ) RETURNING id INTO v_order_id;

    -- 3. Create Tickets and Order Items
    FOR i IN 1..p_quantity LOOP
        -- Insert Ticket
        INSERT INTO tickets (
            event_id,
            owner_user_id,
            status,
            price,
            ticket_type_id,
            metadata
        ) VALUES (
            p_event_id,
            auth.uid(),
            'valid',
            v_ticket_price,
            p_ticket_type_id,
            jsonb_build_object('attendee_name', p_attendee_names[i])
        ) RETURNING id INTO v_ticket_id;

        -- Insert Order Item
        INSERT INTO order_items (
            order_id,
            ticket_id,
            price_at_purchase
        ) VALUES (
            v_order_id,
            v_ticket_id,
            v_ticket_price
        );
    END LOOP;

    -- Update Ticket Type sold count securely
    UPDATE ticket_types
    SET quantity_sold = quantity_sold + p_quantity,
        updated_at = NOW()
    WHERE id = p_ticket_type_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to confirm order payment (marks order as paid and logs transaction)
CREATE OR REPLACE FUNCTION confirm_order_payment(
    p_order_id uuid,
    p_payment_ref text,
    p_provider text
) RETURNS void AS $$
DECLARE
    v_order orders%ROWTYPE;
    v_organizer_id uuid;
BEGIN
    -- Get Order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order.status = 'paid' THEN
        RETURN; -- Idempotent
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = v_order.event_id;

    -- Mark Order Paid
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = p_order_id;

    -- Record Payment
    INSERT INTO payments (
        order_id,
        provider,
        provider_tx_id,
        amount,
        currency,
        status
    ) VALUES (
        p_order_id,
        p_provider,
        p_payment_ref,
        v_order.total_amount,
        v_order.currency,
        'completed'
    );

    /* 
       REMOVED: Double-counting prevention.
       The 'on_payment_completed' trigger in 06_revenue_and_settlements.sql 
       now handles the ledger entry for ticket_sale rev + platform_fee debit.
    */
    /*
    IF v_order.total_amount > 0 THEN
        INSERT INTO financial_transactions (
            wallet_user_id,
            type,
            amount,
            category,
            reference_type,
            reference_id,
            description
        ) VALUES (
            v_organizer_id,
            'credit',
            v_order.total_amount,
            'ticket_sale',
            'order',
            p_order_id,
            'Ticket Sale Revenue'
        );
    END IF;
    */

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
