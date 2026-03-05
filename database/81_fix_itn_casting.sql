-- =============================================================================
-- 81_fix_itn_casting.sql
--
-- Hotfix: Resolves "operator does not exist: uuid = text" error in PayFast ITN.
-- Corrects the confirm_order_payment function to use uuid casting for all 
-- order/ticket lookups and provides a robust implementation.
-- =============================================================================

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
    -- Force cast to uuid immediately to catch invalid strings early
    v_order_uuid := p_order_id::uuid;

    -- 1. Get Order
    SELECT * INTO v_order FROM orders WHERE id = v_order_uuid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- 2. Idempotency: already confirmed
    IF v_order.status = 'paid' THEN
        RETURN;
    END IF;

    -- 3. Mark Order Paid
    UPDATE orders 
    SET status = 'paid', 
        updated_at = NOW() 
    WHERE id = v_order_uuid;

    -- 4. Record Payment
    -- Note: on_payment_inserted_completed trigger handles the financial ledger
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

    -- 5. Activate Reserved Tickets (Transitions tickets from 'reserved' -> 'valid')
    -- Ensures QR codes become active for scanning.
    UPDATE tickets
    SET status     = 'valid',
        updated_at = NOW()
    WHERE id IN (
        SELECT ticket_id FROM order_items WHERE order_id = v_order_uuid
    )
    AND status = 'reserved';

    -- 6. Finalise Inventory Counts (Moves quantity_reserved -> quantity_sold)
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

    -- 7. Add Log for verification
    RAISE NOTICE 'Handled ITN for order % (Reference: %)', p_order_id, p_payment_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
