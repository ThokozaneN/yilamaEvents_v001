-- =============================================================================
-- 8. REFINED ANALYTICS & DAILY TIER SALES
-- =============================================================================

-- RPC to get daily sales grouped by tier for a specific event or mixed
CREATE OR REPLACE FUNCTION get_daily_tier_sales(
    p_organizer_id uuid,
    p_event_id uuid DEFAULT NULL,
    p_start_date timestamptz DEFAULT now() - interval '30 days',
    p_end_date timestamptz DEFAULT now()
)
RETURNS TABLE (
    sale_date date,
    event_title text,
    tier_name text,
    quantity_sold bigint,
    total_amount numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.created_at::date as sale_date,
        e.title as event_title,
        tt.name as tier_name,
        COUNT(oi.id)::bigint as quantity_sold,
        SUM(o.total_amount)::numeric as total_amount
    FROM orders o
    JOIN events e ON e.id = o.event_id
    JOIN order_items oi ON oi.order_id = o.id
    JOIN ticket_types tt ON tt.id = oi.ticket_type_id
    WHERE e.organizer_id = p_organizer_id
      AND (p_event_id IS NULL OR e.id = p_event_id)
      AND o.status = 'paid'
      AND o.created_at >= p_start_date
      AND o.created_at <= p_end_date
    GROUP BY o.created_at::date, e.title, tt.name
    ORDER BY o.created_at::date DESC, e.title, tt.name;
END;
$$;

-- Refined check_organizer_limits to use the correct keys for the frontend
CREATE OR REPLACE FUNCTION check_organizer_limits_v2(org_id uuid DEFAULT auth.uid())
RETURNS jsonb AS $$
DECLARE
    v_plan          record;
    v_event_count   integer;
    v_ticket_count  integer;
    v_scanner_count integer;
BEGIN
    SELECT
        COALESCE(p.events_limit,   5)   AS events_limit,
        COALESCE(p.tickets_limit,  500) AS tickets_limit,
        COALESCE(p.scanners_limit, 2)   AS scanners_limit,
        COALESCE(p.name, 'Free')        AS plan_name,
        COALESCE(p.commission_rate, 0.1) AS commission_rate
    INTO v_plan
    FROM profiles pr
    LEFT JOIN subscriptions s  ON s.user_id = pr.id AND s.status = 'active' AND s.current_period_end > now()
    LEFT JOIN plans p          ON p.id = s.plan_id
    WHERE pr.id = org_id
    LIMIT 1;

    -- Live counts (only published and NOT ended)
    SELECT COUNT(*) INTO v_event_count
    FROM events 
    WHERE organizer_id = org_id 
      AND status = 'published'
      AND (ends_at > now() OR ends_at IS NULL);

    SELECT COALESCE(SUM(quantity_sold), 0) INTO v_ticket_count
    FROM ticket_types tt
    JOIN events e ON e.id = tt.event_id
    WHERE e.organizer_id = org_id;

    SELECT COUNT(*) INTO v_scanner_count
    FROM event_scanners es
    JOIN events e ON e.id = es.event_id
    WHERE e.organizer_id = org_id AND es.is_active = true;

    RETURN jsonb_build_object(
        'plan_name',       COALESCE(v_plan.plan_name, 'Free'),
        'events_current',  v_event_count, -- Matches frontend Usage type
        'events_limit',    COALESCE(v_plan.events_limit, 5),
        'tickets_current', v_ticket_count, -- Matches frontend Usage type
        'tickets_limit',   COALESCE(v_plan.tickets_limit, 500),
        'scanner_current', v_scanner_count, -- Matches frontend Usage type
        'scanner_limit',   COALESCE(v_plan.scanners_limit, 2),
        'commission_rate', COALESCE(v_plan.commission_rate, 0.1)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_ticket_performance to include 24h velocity
CREATE OR REPLACE FUNCTION get_ticket_performance()
RETURNS TABLE (
    tier_id uuid,
    event_id uuid,
    event_title text,
    tier_name text,
    current_price numeric,
    quantity_limit integer,
    quantity_sold integer,
    quantity_remaining integer,
    sell_through_rate numeric,
    gross_revenue numeric,
    velocity_24h bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        tt.id,
        tt.event_id,
        e.title,
        tt.name,
        tt.price,
        tt.quantity_limit,
        tt.quantity_sold,
        (tt.quantity_limit - tt.quantity_sold),
        CASE
            WHEN COALESCE(tt.quantity_limit, 0) > 0
            THEN ROUND((tt.quantity_sold::NUMERIC / tt.quantity_limit::NUMERIC) * 100, 1)
            ELSE 0
        END,
        (tt.quantity_sold * tt.price)::numeric,
        (
            SELECT COUNT(*)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.ticket_type_id = tt.id
              AND o.status = 'paid'
              AND o.created_at >= now() - interval '24 hours'
        )::bigint
    FROM ticket_types tt
    JOIN events e ON e.id = tt.event_id
    WHERE e.organizer_id = auth.uid();
END;
$$;
