-- =============================================================================
-- 88_CONTINUOUS_FIXES.SQL
-- Consolidated file for all subsequent database fixes and enhancements.
-- =============================================================================

-- 1. UNIFY NOTIFICATIONS TABLE
-- Ensure as many places as possible use 'app_notifications' as the source of truth.
-- We'll create a view 'notifications' for backward compatibility if it doesn't already exist.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications' AND table_type = 'VIEW') 
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_notifications' AND table_type = 'BASE TABLE') THEN
        -- If 'notifications' is a table, we leave it for now to avoid data loss, 
        -- but if it's missing, we make it a view of app_notifications.
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
            CREATE VIEW public.notifications AS SELECT * FROM public.app_notifications;
        END IF;
    END IF;
END $$;

-- 2. TICKET DELETION GRACE PERIOD
-- Function to clean up tickets 12 hours after the event ends.
CREATE OR REPLACE FUNCTION public.cleanup_expired_tickets()
RETURNS void AS $$
BEGIN
    -- Delete tickets where the event ended more than 12 hours ago
    -- We join with events to get the ends_at or fallback to starts_at + 6h
    DELETE FROM public.tickets
    WHERE id IN (
        SELECT t.id
        FROM public.tickets t
        JOIN public.events e ON t.event_id = e.id
        WHERE COALESCE(e.ends_at, e.starts_at + INTERVAL '6 hours') < (now() - INTERVAL '12 hours')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. NOTIFICATION TRIGGERS FOR UPCOMING EVENTS
-- This RPC will be called by an Edge Function cron job.
CREATE OR REPLACE FUNCTION public.generate_upcoming_event_notifications()
RETURNS TABLE (user_id uuid, event_id uuid, event_title text, email text) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        t.owner_user_id AS user_id, 
        e.id AS event_id, 
        e.title AS event_title,
        p.email
    FROM public.tickets t
    JOIN public.events e ON t.event_id = e.id
    JOIN public.profiles p ON t.owner_user_id = p.id
    WHERE e.starts_at > now() 
      AND e.starts_at < (now() + INTERVAL '24 hours')
      AND t.status = 'valid'
      -- Avoid duplicate in-app notifications
      AND NOT EXISTS (
          SELECT 1 FROM public.app_notifications n 
          WHERE n.user_id = t.owner_user_id 
          AND n.type = 'event_update'
          AND n.action_url = '/events/' || e.id
          AND n.created_at > (now() - INTERVAL '48 hours')
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. UNUSED TICKET REMINDERS (For events currently happening)
CREATE OR REPLACE FUNCTION public.generate_unused_ticket_notifications()
RETURNS TABLE (user_id uuid, event_id uuid, event_title text) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        t.owner_user_id AS user_id, 
        e.id AS event_id, 
        e.title AS event_title
    FROM public.tickets t
    JOIN public.events e ON t.event_id = e.id
    WHERE e.starts_at <= now() 
      AND COALESCE(e.ends_at, e.starts_at + INTERVAL '6 hours') > now()
      AND t.status = 'valid' -- Valid means NOT yet used
      AND NOT EXISTS (
          SELECT 1 FROM public.app_notifications n 
          WHERE n.user_id = t.owner_user_id 
          AND n.title LIKE 'Ticket Waiting%'
          AND n.created_at > (now() - INTERVAL '24 hours')
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. TICKET EXPIRATION NOTIFICATIONS (For events that just ended)
CREATE OR REPLACE FUNCTION public.generate_expired_ticket_notifications()
RETURNS TABLE (user_id uuid, event_id uuid, event_title text) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        t.owner_user_id AS user_id, 
        e.id AS event_id, 
        e.title AS event_title
    FROM public.tickets t
    JOIN public.events e ON t.event_id = e.id
    WHERE COALESCE(e.ends_at, e.starts_at + INTERVAL '6 hours') BETWEEN (now() - INTERVAL '12 hours') AND now()
      AND NOT EXISTS (
          SELECT 1 FROM public.app_notifications n 
          WHERE n.user_id = t.owner_user_id 
          AND n.title = 'Ticket Expired ⚠️'
          AND n.created_at > (now() - INTERVAL '24 hours')
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. SYNC EVENT CATEGORY ENUM
-- =============================================================================
DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Nightlife';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Arts & Theatre';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Food & Drink';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Networking';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Lifestyle';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TYPE event_category_enum ADD VALUE 'Fashion';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 6. PERFORMANCE INDICES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_owner_event ON public.tickets(owner_user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS idx_event_categories_name ON public.event_categories(name);

-- =============================================================================
-- 7. ANALYTICS & DASHBOARD ALIGNMENT
-- =============================================================================

-- Fix get_event_attendance_funnel naming to match frontend
CREATE OR REPLACE FUNCTION get_event_attendance_funnel()
RETURNS TABLE (
    event_id uuid,
    organizer_id uuid,
    title text,
    status text,
    total_capacity bigint,
    tickets_sold bigint,
    tickets_scanned_in bigint, -- Updated name
    sold_pct numeric,
    check_in_rate numeric -- Updated name
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.organizer_id,
        e.title,
        e.status,
        COALESCE(SUM(tt.quantity_limit), 0)::bigint,
        COALESCE(SUM(tt.quantity_sold), 0)::bigint,
        COUNT(DISTINCT tc.ticket_id)::bigint,
        CASE
            WHEN SUM(tt.quantity_limit) > 0
            THEN ROUND((SUM(tt.quantity_sold)::NUMERIC / NULLIF(SUM(tt.quantity_limit), 0)::NUMERIC) * 100, 1)
            ELSE 0
        END,
        CASE
            WHEN SUM(tt.quantity_sold) > 0
            THEN ROUND((COUNT(DISTINCT tc.ticket_id)::NUMERIC / NULLIF(SUM(tt.quantity_sold), 0)::NUMERIC) * 100, 1)
            ELSE 0
        END
    FROM events e
    LEFT JOIN ticket_types tt ON tt.event_id = e.id
    LEFT JOIN ticket_checkins tc ON tc.event_id = e.id
    WHERE e.organizer_id = auth.uid()
    GROUP BY e.id, e.organizer_id, e.title, e.status;
END;
$$;

-- New RPC for the Financial Ledger table in Analytics tab
CREATE OR REPLACE FUNCTION get_organizer_event_ledger()
RETURNS TABLE (
    event_id uuid,
    event_title text,
    gross_revenue numeric,
    total_fees numeric,
    total_refunds numeric,
    net_revenue numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.title as event_title,
        COALESCE(SUM(CASE WHEN ft.category = 'ticket_sale' AND ft.type = 'credit' THEN ft.amount ELSE 0 END), 0) as gross_revenue,
        COALESCE(SUM(CASE WHEN ft.category = 'platform_fee' AND ft.type = 'debit' THEN ft.amount ELSE 0 END), 0) as total_fees,
        COALESCE(SUM(CASE WHEN ft.category = 'refund' AND ft.type = 'debit' THEN ft.amount ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(CASE WHEN ft.type = 'credit' THEN ft.amount ELSE -ft.amount END), 0) as net_revenue
    FROM events e
    LEFT JOIN financial_transactions ft ON ft.reference_id::text = e.id::text OR ft.reference_id IN (SELECT id FROM orders WHERE event_id = e.id)
    WHERE e.organizer_id = auth.uid()
    GROUP BY e.id, e.title;
END;
$$;
