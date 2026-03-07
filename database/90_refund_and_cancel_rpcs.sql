-- 90_refund_and_cancel_rpcs.sql
--
-- Adds logic for organizers to manage orders and cancel subscriptions.

-- 1. RPC to cancel an active subscription at the end of the period
CREATE OR REPLACE FUNCTION cancel_active_subscription()
RETURNS void AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    UPDATE subscriptions
    SET cancel_at_period_end = true,
        updated_at = now()
    WHERE user_id = v_user_id
      AND status = 'active';
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active subscription found to cancel.';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. RPC to fetch orders for an organizer's events
-- This joins orders with ticket counts for the organizer's convenience.
CREATE OR REPLACE FUNCTION get_organizer_orders(p_event_id uuid DEFAULT NULL)
RETURNS TABLE (
    order_id uuid,
    event_id uuid,
    event_title text,
    buyer_name text,
    buyer_email text,
    total_amount numeric,
    status text,
    ticket_count bigint,
    created_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.event_id,
        e.title as event_title,
        p.name as buyer_name,
        p.email as buyer_email,
        o.total_amount,
        o.status,
        COUNT(oi.id) as ticket_count,
        o.created_at
    FROM orders o
    JOIN events e ON o.event_id = e.id
    LEFT JOIN profiles p ON o.user_id = p.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE e.organizer_id = auth.uid()
      AND (p_event_id IS NULL OR o.event_id = p_event_id)
    GROUP BY o.id, e.title, p.name, p.email
    ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS access to these functions via RPC
GRANT EXECUTE ON FUNCTION cancel_active_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION get_organizer_orders(uuid) TO authenticated;
