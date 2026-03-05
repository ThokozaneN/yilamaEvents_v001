-- =============================================================================
-- 76_analytics_views_and_rpcs.sql
--
-- Creates all analytics views and RPCs used by the Organizer Dashboard.
-- These were never saved to the repo (only existed in the old project).
-- Safe to re-run (all are CREATE OR REPLACE / DROP IF EXISTS).
-- =============================================================================


-- ─── VIEW 1: v_organizer_revenue_breakdown ────────────────────────────────────
-- Used by OrganizerDashboard analytics tab.
-- Shows per-event revenue breakdown by ticket tier.

DROP VIEW IF EXISTS v_organizer_revenue_breakdown CASCADE;
CREATE OR REPLACE VIEW v_organizer_revenue_breakdown AS
SELECT
    e.organizer_id,
    e.id          AS event_id,
    e.title       AS event_title,
    e.starts_at,
    e.status      AS event_status,
    tt.id         AS tier_id,
    tt.name       AS tier_name,
    tt.price      AS tier_price,
    tt.quantity_sold,
    tt.quantity_limit,
    COALESCE(tt.quantity_sold, 0) * COALESCE(tt.price, 0)         AS tier_gross_revenue,
    CASE
        WHEN COALESCE(tt.quantity_limit, 0) > 0
        THEN ROUND((tt.quantity_sold::NUMERIC / tt.quantity_limit::NUMERIC) * 100, 1)
        ELSE 0
    END AS fill_rate_pct
FROM events e
JOIN ticket_types tt ON tt.event_id = e.id
WHERE e.status NOT IN ('draft');

GRANT SELECT ON v_organizer_revenue_breakdown TO authenticated;


-- ─── VIEW 2: v_ticket_performance ─────────────────────────────────────────────
-- Per-tier sales velocity. Used by the dashboard analytics tab.

DROP VIEW IF EXISTS v_ticket_performance CASCADE;
CREATE OR REPLACE VIEW v_ticket_performance AS
SELECT
    tt.id                          AS tier_id,
    tt.event_id,
    e.organizer_id,
    e.title                        AS event_title,
    tt.name                        AS tier_name,
    tt.price,
    tt.quantity_limit,
    tt.quantity_sold,
    tt.quantity_limit - tt.quantity_sold  AS quantity_remaining,
    CASE
        WHEN COALESCE(tt.quantity_limit, 0) > 0
        THEN ROUND((tt.quantity_sold::NUMERIC / tt.quantity_limit::NUMERIC) * 100, 1)
        ELSE 0
    END AS sell_through_pct,
    tt.quantity_sold * tt.price    AS gross_revenue
FROM ticket_types tt
JOIN events e ON e.id = tt.event_id;

GRANT SELECT ON v_ticket_performance TO authenticated;


-- ─── VIEW 3: v_event_attendance_funnel ────────────────────────────────────────
-- Conversion funnel per event. Used by dashboard analytics funnel chart.

DROP VIEW IF EXISTS v_event_attendance_funnel CASCADE;
CREATE OR REPLACE VIEW v_event_attendance_funnel AS
SELECT
    e.id                           AS event_id,
    e.organizer_id,
    e.title,
    e.status,
    SUM(tt.quantity_limit)         AS total_capacity,
    SUM(tt.quantity_sold)          AS tickets_sold,
    COUNT(DISTINCT tc.ticket_id)   AS tickets_scanned,
    CASE
        WHEN SUM(tt.quantity_limit) > 0
        THEN ROUND((SUM(tt.quantity_sold)::NUMERIC / SUM(tt.quantity_limit)::NUMERIC) * 100, 1)
        ELSE 0
    END AS sold_pct,
    CASE
        WHEN SUM(tt.quantity_sold) > 0
        THEN ROUND((COUNT(DISTINCT tc.ticket_id)::NUMERIC / SUM(tt.quantity_sold)::NUMERIC) * 100, 1)
        ELSE 0
    END AS attendance_pct
FROM events e
LEFT JOIN ticket_types tt ON tt.event_id = e.id
LEFT JOIN ticket_checkins tc ON tc.event_id = e.id
GROUP BY e.id, e.organizer_id, e.title, e.status;

GRANT SELECT ON v_event_attendance_funnel TO authenticated;


-- ─── VIEW 4: v_organizer_balance ──────────────────────────────────────────────
-- Per-organizer running balance from the financial_transactions ledger.
-- Replaces the old v_organizer_balances (plural) for consistency with dashboard code.

DROP VIEW IF EXISTS v_organizer_balance CASCADE;
CREATE OR REPLACE VIEW v_organizer_balance AS
SELECT
    wallet_user_id                                       AS organizer_id,
    SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END) AS total_debits,
    SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END) AS available_balance
FROM financial_transactions
GROUP BY wallet_user_id;

GRANT SELECT ON v_organizer_balance TO authenticated;


-- ─── RPC: get_event_revenue_real_time ─────────────────────────────────────────
-- Called by dashboard "Refresh Revenue" button per event.
-- Reads live from ticket_types.quantity_sold (always up to date).

CREATE OR REPLACE FUNCTION get_event_revenue_real_time(p_event_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_organizer_id uuid;
    v_gross_revenue numeric;
    v_net_revenue   numeric;
    v_fee_pct       numeric;
    v_tickets_sold  integer;
BEGIN
    -- Security: confirm caller owns the event
    SELECT organizer_id INTO v_organizer_id
    FROM events WHERE id = p_event_id;

    IF v_organizer_id IS NULL OR v_organizer_id != auth.uid() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Derive revenue from ticket_types (immediately consistent)
    SELECT
        COALESCE(SUM(quantity_sold * price), 0),
        COALESCE(SUM(quantity_sold), 0)
    INTO v_gross_revenue, v_tickets_sold
    FROM ticket_types
    WHERE event_id = p_event_id;

    -- Get fee rate for this organizer
    v_fee_pct := get_organizer_fee_percentage(v_organizer_id);
    v_net_revenue := ROUND(v_gross_revenue * (1 - v_fee_pct), 2);

    RETURN jsonb_build_object(
        'event_id',      p_event_id,
        'gross_revenue', v_gross_revenue,
        'net_revenue',   v_net_revenue,
        'tickets_sold',  v_tickets_sold,
        'fee_pct',       v_fee_pct
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── RPC: check_organizer_limits ──────────────────────────────────────────────
-- Called on dashboard load to show usage vs. plan limits.

CREATE OR REPLACE FUNCTION check_organizer_limits(org_id uuid DEFAULT auth.uid())
RETURNS jsonb AS $$
DECLARE
    v_plan          record;
    v_event_count   integer;
    v_ticket_count  integer;
    v_scanner_count integer;
BEGIN
    -- Get plan limits (from subscription or default free tier)
    SELECT
        COALESCE(p.events_limit,   5)   AS events_limit,
        COALESCE(p.tickets_limit,  500) AS tickets_limit,
        COALESCE(p.scanners_limit, 2)   AS scanners_limit,
        COALESCE(p.name, 'Free')        AS plan_name
    INTO v_plan
    FROM profiles pr
    LEFT JOIN subscriptions s  ON s.user_id = pr.id AND s.status = 'active' AND s.current_period_end > now()
    LEFT JOIN plans p          ON p.id = s.plan_id
    WHERE pr.id = org_id
    LIMIT 1;

    -- Live counts
    SELECT COUNT(*) INTO v_event_count
    FROM events WHERE organizer_id = org_id AND status NOT IN ('cancelled', 'ended');

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
        'events_used',     v_event_count,
        'events_limit',    COALESCE(v_plan.events_limit, 5),
        'tickets_used',    v_ticket_count,
        'tickets_limit',   COALESCE(v_plan.tickets_limit, 500),
        'scanners_used',   v_scanner_count,
        'scanners_limit',  COALESCE(v_plan.scanners_limit, 2)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── FIX: Ensure financial_transactions has correct RLS for organizer reads ────
-- The financial_transactions table must allow organizers to read their own rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'financial_transactions'
      AND policyname = 'Organizers can view their own transactions'
  ) THEN
    EXECUTE 'CREATE POLICY "Organizers can view their own transactions"
      ON financial_transactions FOR SELECT
      USING (wallet_user_id = auth.uid())';
  END IF;
END $$;


-- ─── FIX: Ensure orders update triggers financial_transactions on 'paid' ───────
-- The v1 flow used payments table. The v2 flow (PayFast ITN) calls
-- confirm_order_payment which marks order.status = 'paid'.
-- Add a trigger so that when order transitions to 'paid', we ledger the revenue.

CREATE OR REPLACE FUNCTION ledger_on_order_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_organizer_id uuid;
    v_fee_pct      numeric;
    v_fee_amount   numeric;
    v_already_done boolean;
BEGIN
    -- Only fire on 'paid' transition
    IF NEW.status != 'paid' OR OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    -- Get organizer
    SELECT e.organizer_id INTO v_organizer_id
    FROM events e WHERE e.id = NEW.event_id;

    IF v_organizer_id IS NULL THEN RETURN NEW; END IF;

    -- Idempotency check
    SELECT EXISTS(
        SELECT 1 FROM financial_transactions
        WHERE reference_id = NEW.id::text AND reference_type = 'order' AND category = 'ticket_sale'
    ) INTO v_already_done;

    IF v_already_done THEN RETURN NEW; END IF;

    -- Credit: gross sale
    INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
    VALUES (v_organizer_id, 'credit', NEW.total_amount, 'ticket_sale', 'order', NEW.id::text,
            'Ticket sale — order ' || NEW.id);

    -- Debit: platform fee
    v_fee_pct    := get_organizer_fee_percentage(v_organizer_id);
    v_fee_amount := ROUND(NEW.total_amount * v_fee_pct, 2);
    IF v_fee_amount > 0 THEN
        INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
        VALUES (v_organizer_id, 'debit', v_fee_amount, 'platform_fee', 'order', NEW.id::text,
                'Platform commission (' || ROUND(v_fee_pct * 100) || '%) — order ' || NEW.id);
    END IF;

    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_ledger_on_order_paid ON orders;
CREATE TRIGGER trigger_ledger_on_order_paid
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION ledger_on_order_paid();


-- ─── VERIFY ───────────────────────────────────────────────────────────────────

SELECT 'v_organizer_revenue_breakdown' AS view_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_organizer_revenue_breakdown')
            THEN '✅ exists' ELSE '❌ missing' END AS status
UNION ALL
SELECT 'v_ticket_performance',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_ticket_performance')
            THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'v_event_attendance_funnel',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_event_attendance_funnel')
            THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'v_organizer_balance',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'v_organizer_balance')
            THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'get_event_revenue_real_time',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_event_revenue_real_time' AND pronamespace = 'public'::regnamespace)
            THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'check_organizer_limits',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_organizer_limits' AND pronamespace = 'public'::regnamespace)
            THEN '✅ exists' ELSE '❌ missing' END
UNION ALL
SELECT 'trigger_ledger_on_order_paid',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'trigger_ledger_on_order_paid')
            THEN '✅ exists' ELSE '❌ missing' END;
