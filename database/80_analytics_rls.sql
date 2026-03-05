-- =============================================================================
-- 80_analytics_rls.sql
--
-- Security Fix: Removes public authenticated access to global analytics views.
-- Replaces them with parameterized RPCs or RLS views to enforce that organizers
-- can only see revenue for events they own.
-- =============================================================================

-- Existing views cannot easily use RLS directly against the authenticated user
-- if they are simple views. However, PostgreSQL updatable views *can* inherit RLS 
-- from underlying tables, but our views are complex aggregations.
-- The most secure approach in Supabase is to convert them to SECURITY DEFINER
-- functions that filter by auth.uid().

--------------------------------------------------------------------------------
-- 1. v_organizer_revenue_breakdown -> get_organizer_revenue_breakdown()
--------------------------------------------------------------------------------
DROP VIEW IF EXISTS v_organizer_revenue_breakdown CASCADE;

CREATE OR REPLACE FUNCTION get_organizer_revenue_breakdown()
RETURNS TABLE (
    organizer_id uuid,
    event_id uuid,
    event_title text,
    starts_at timestamptz,
    event_status text,
    tier_id uuid,
    tier_name text,
    tier_price numeric,
    quantity_sold integer,
    quantity_limit integer,
    tier_gross_revenue numeric,
    fill_rate_pct numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.organizer_id,
        e.id,
        e.title,
        e.starts_at,
        e.status,
        tt.id,
        tt.name,
        tt.price,
        tt.quantity_sold,
        tt.quantity_limit,
        COALESCE(tt.quantity_sold, 0) * COALESCE(tt.price, 0),
        CASE
            WHEN COALESCE(tt.quantity_limit, 0) > 0
            THEN ROUND((tt.quantity_sold::NUMERIC / tt.quantity_limit::NUMERIC) * 100, 1)
            ELSE 0
        END
    FROM events e
    JOIN ticket_types tt ON tt.event_id = e.id
    WHERE e.status NOT IN ('draft')
    AND e.organizer_id = auth.uid(); -- RLS Filter
END;
$$;


--------------------------------------------------------------------------------
-- 2. v_ticket_performance -> get_ticket_performance()
--------------------------------------------------------------------------------
DROP VIEW IF EXISTS v_ticket_performance CASCADE;

CREATE OR REPLACE FUNCTION get_ticket_performance()
RETURNS TABLE (
    tier_id uuid,
    event_id uuid,
    organizer_id uuid,
    event_title text,
    tier_name text,
    price numeric,
    quantity_limit integer,
    quantity_sold integer,
    quantity_remaining integer,
    sell_through_pct numeric,
    gross_revenue numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        tt.id,
        tt.event_id,
        e.organizer_id,
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
        (tt.quantity_sold * tt.price)
    FROM ticket_types tt
    JOIN events e ON e.id = tt.event_id
    WHERE e.organizer_id = auth.uid(); -- RLS Filter
END;
$$;


--------------------------------------------------------------------------------
-- 3. v_event_attendance_funnel -> get_event_attendance_funnel()
--------------------------------------------------------------------------------
DROP VIEW IF EXISTS v_event_attendance_funnel CASCADE;

CREATE OR REPLACE FUNCTION get_event_attendance_funnel()
RETURNS TABLE (
    event_id uuid,
    organizer_id uuid,
    title text,
    status text,
    total_capacity bigint,
    tickets_sold bigint,
    tickets_scanned bigint,
    sold_pct numeric,
    attendance_pct numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.organizer_id,
        e.title,
        e.status,
        SUM(tt.quantity_limit)::bigint,
        SUM(tt.quantity_sold)::bigint,
        COUNT(DISTINCT tc.ticket_id)::bigint,
        CASE
            WHEN SUM(tt.quantity_limit) > 0
            THEN ROUND((SUM(tt.quantity_sold)::NUMERIC / SUM(tt.quantity_limit)::NUMERIC) * 100, 1)
            ELSE 0
        END,
        CASE
            WHEN SUM(tt.quantity_sold) > 0
            THEN ROUND((COUNT(DISTINCT tc.ticket_id)::NUMERIC / SUM(tt.quantity_sold)::NUMERIC) * 100, 1)
            ELSE 0
        END
    FROM events e
    LEFT JOIN ticket_types tt ON tt.event_id = e.id
    LEFT JOIN ticket_checkins tc ON tc.event_id = e.id
    WHERE e.organizer_id = auth.uid() -- RLS Filter
    GROUP BY e.id, e.organizer_id, e.title, e.status;
END;
$$;


--------------------------------------------------------------------------------
-- 4. v_organizer_balance (No change needed since filter is by organizer_id inside the query anyway, but wait, it didn't filter.)
--------------------------------------------------------------------------------
-- Fix the original view to also filter by auth.uid(). Let's just create an RPC.
DROP VIEW IF EXISTS v_organizer_balance CASCADE;

CREATE OR REPLACE FUNCTION get_organizer_balance()
RETURNS TABLE (
    organizer_id uuid,
    total_credits numeric,
    total_debits numeric,
    available_balance numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        wallet_user_id,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END),
        SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END)
    FROM financial_transactions
    WHERE wallet_user_id = auth.uid() -- RLS Filter
    GROUP BY wallet_user_id;
END;
$$;
