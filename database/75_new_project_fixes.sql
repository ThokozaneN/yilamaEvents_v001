-- =============================================================================
-- 75_new_project_fixes.sql
--
-- THE DEFINITIVE POST-MIGRATION FIX FILE FOR ANY NEW PROJECT DEPLOYMENT
--
-- Run this ONCE in the SQL Editor after all numbered migrations (01→74) have run.
-- Safe to re-run — all statements are idempotent (DROP IF EXISTS, CREATE POLICY
-- with an existence check, CREATE OR REPLACE, etc.)
-- =============================================================================


-- ─── FIX 1: Drop all ambiguous purchase_tickets overloads ─────────────────────
-- Multiple overloads exist from different migration versions.
-- PostgREST sends JSON arrays without type information, so Postgres cannot
-- disambiguate between text[] and uuid[] when seat_ids is an empty array.
-- We keep ONLY the definitive 9-parameter uuid[] version (from 51_seating_rpc_updates.sql).

DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid);
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text);


-- ─── FIX 2: Add missing RLS policies for tickets and orders ──────────────────
-- These policies were added in 48_fix_tickets_rls.sql but use CREATE POLICY
-- (not CREATE OR REPLACE), so they error if run twice. We guard with an
-- existence check so this file is safely idempotent.

DO $$
BEGIN
  -- Tickets: buyers read their own
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'Owners can view their own tickets'
  ) THEN
    EXECUTE 'CREATE POLICY "Owners can view their own tickets"
      ON tickets FOR SELECT USING (owner_user_id = auth.uid())';
  END IF;

  -- Tickets: organizers read tickets for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'Organizers can view tickets for their events'
  ) THEN
    EXECUTE 'CREATE POLICY "Organizers can view tickets for their events"
      ON tickets FOR SELECT USING (
        EXISTS (SELECT 1 FROM events WHERE events.id = tickets.event_id AND events.organizer_id = auth.uid())
      )';
  END IF;

  -- Tickets: scanners read tickets for their assigned events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'Scanners can view assigned event tickets'
  ) THEN
    EXECUTE 'CREATE POLICY "Scanners can view assigned event tickets"
      ON tickets FOR SELECT USING (
        EXISTS (SELECT 1 FROM event_scanners
                WHERE event_scanners.event_id = tickets.event_id
                AND event_scanners.user_id = auth.uid()
                AND event_scanners.is_active = true)
      )';
  END IF;

  -- Orders: buyers read their own
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Buyers can view their own orders'
  ) THEN
    EXECUTE 'CREATE POLICY "Buyers can view their own orders"
      ON orders FOR SELECT USING (user_id = auth.uid())';
  END IF;

  -- Orders: organizers read orders for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Organizers can view orders for their events'
  ) THEN
    EXECUTE 'CREATE POLICY "Organizers can view orders for their events"
      ON orders FOR SELECT USING (
        EXISTS (SELECT 1 FROM events WHERE events.id = orders.event_id AND events.organizer_id = auth.uid())
      )';
  END IF;
END $$;


-- ─── FIX 3: Fix notify-verification-result webhook URL ────────────────────────
-- Files 20, 21, 24, 26 all hardcoded an old project ref. This overwrites them
-- using the current project URL, which is auto-set by SUPABASE_URL env var.
-- NOTE: notify-verification-result can be deployed with --no-verify-jwt since
-- it's called from a DB trigger (no user JWT available).

CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
    v_email text;
    v_url text;
    v_anon_key text;
BEGIN
    -- Build URL dynamically from current_setting, or fall back to hardcoded new project
    v_url := COALESCE(
        current_setting('app.settings.supabase_url', true),
        'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
    ) || '/functions/v1/notify-verification-result';

    -- Try Vault first, then app settings
    BEGIN
        SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_anon_key := NULL;
    END;
    IF v_anon_key IS NULL THEN
        v_anon_key := current_setting('app.settings.anon_key', true);
    END IF;

    IF old.organizer_status IS DISTINCT FROM new.organizer_status
       AND new.organizer_status IN ('verified', 'rejected', 'suspended') THEN
        v_email := new.email;
        -- Fire even if anon_key is unknown — function has verify_jwt = false
        PERFORM net.http_post(
            url := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_anon_key, 'no-key')
            ),
            body := jsonb_build_object(
                'to', v_email,
                'name', COALESCE(new.business_name, new.name, 'Organizer'),
                'decision', new.organizer_status
            )
        );
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_verification ON profiles;
CREATE TRIGGER trigger_notify_verification
AFTER UPDATE OF organizer_status ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_notify_verification_result();


-- ─── FIX 4: Fix ticket email webhook (send-ticket-email) ─────────────────────
-- Deployed with --no-verify-jwt so DB triggers don't need anon_key from Vault.
-- Fires when an order's status transitions to 'paid'.

CREATE OR REPLACE FUNCTION execute_ticket_email_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payload jsonb;
  v_url text;
  v_anon_key text;
BEGIN
  v_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
  ) || '/functions/v1/send-ticket-email';

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  BEGIN
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, 'no-key')
    ),
    body := v_payload
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_send_ticket_email ON orders;
CREATE TRIGGER trigger_send_ticket_email
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'paid' AND NEW.status = 'paid')
  EXECUTE FUNCTION execute_ticket_email_webhook();


-- ─── FIX 5: Fix waitlist webhook (process-waitlist) ──────────────────────────
-- Fires when an event transitions from 'coming_soon' to 'published' or 'cancelled'.

CREATE OR REPLACE FUNCTION execute_waitlist_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payload jsonb;
  v_url text;
  v_anon_key text;
BEGIN
  v_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
  ) || '/functions/v1/process-waitlist';

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  BEGIN
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, 'no-key')
    ),
    body := v_payload
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_process_waitlist ON events;
CREATE TRIGGER trigger_process_waitlist
  AFTER UPDATE OF status ON events
  FOR EACH ROW
  WHEN (OLD.status = 'coming_soon' AND NEW.status IN ('published', 'cancelled'))
  EXECUTE FUNCTION execute_waitlist_webhook();


-- ─── FIX 6: Fix get_personalized_events — broken hardcoded column list ────────
-- The personalized branch selected a hardcoded column list that was missing
-- columns added by later migrations (max_capacity, latitude, is_private, etc.).
-- Using a subquery SELECT e.* pattern avoids future breakage as schema evolves.

CREATE OR REPLACE FUNCTION get_personalized_events(p_user_id UUID DEFAULT NULL)
RETURNS SETOF events AS $$
BEGIN
    IF p_user_id IS NULL THEN
        -- Unauthenticated: trending-first global view
        RETURN QUERY
        SELECT e.* FROM events e
        WHERE e.status = 'published'
        AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= NOW()
        ORDER BY COALESCE(
          (SELECT CASE WHEN SUM(quantity_limit) > 0
                       THEN SUM(quantity_sold)::NUMERIC / SUM(quantity_limit)::NUMERIC
                       ELSE 0 END
           FROM ticket_types WHERE event_id = e.id), 0) DESC,
          e.created_at DESC;
    ELSE
        -- Authenticated: score by past preferences + loyalty boost
        RETURN QUERY
        WITH
            PastCategories AS (
                SELECT DISTINCT e.category_id
                FROM tickets t JOIN events e ON t.event_id = e.id
                WHERE t.owner_user_id = p_user_id AND e.category_id IS NOT NULL
            ),
            PastOrganizers AS (
                SELECT DISTINCT e.organizer_id
                FROM tickets t JOIN events e ON t.event_id = e.id
                WHERE t.owner_user_id = p_user_id
            ),
            ScoredEvents AS (
                SELECT e.*,
                    COALESCE((SELECT CASE WHEN SUM(quantity_limit) > 0
                                          THEN (SUM(quantity_sold)::NUMERIC / SUM(quantity_limit)::NUMERIC) * 10
                                          ELSE 0 END
                               FROM ticket_types WHERE event_id = e.id), 0)
                    + CASE WHEN e.category_id IN (SELECT category_id FROM PastCategories) THEN 10 ELSE 0 END
                    + CASE WHEN e.organizer_id IN (SELECT organizer_id FROM PastOrganizers) THEN 5 ELSE 0 END
                    AS total_score
                FROM events e
                WHERE e.status = 'published'
                AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= NOW()
            )
        SELECT (SELECT e FROM events e WHERE e.id = ScoredEvents.id).*
        FROM ScoredEvents
        ORDER BY total_score DESC, starts_at ASC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── FIX 7: Ensure organizer profiles have correct status ────────────────────
-- On a fresh project, newly imported organizer profiles may have NULL status.
-- The app checks organizer_status to render the dashboard correctly.
-- This sets NULL values to 'pending' (safe default; admin can promote to verified).

UPDATE profiles
SET organizer_status = 'pending'
WHERE role = 'organizer' AND organizer_status IS NULL;


-- =============================================================================
-- VERIFICATION QUERIES (results appear in the SQL Editor output)
-- =============================================================================

-- 1. Confirm only ONE purchase_tickets signature remains
SELECT
    'purchase_tickets signatures' AS check_name,
    COUNT(*) AS count,
    CASE WHEN COUNT(*) = 1 THEN '✅ OK' ELSE '❌ STILL AMBIGUOUS' END AS status
FROM pg_proc
WHERE proname = 'purchase_tickets' AND pronamespace = 'public'::regnamespace;

-- 2. Confirm tickets RLS policies exist
SELECT
    'tickets RLS policies' AS check_name,
    COUNT(*) AS count,
    CASE WHEN COUNT(*) >= 1 THEN '✅ OK' ELSE '❌ MISSING' END AS status
FROM pg_policies
WHERE tablename = 'tickets' AND policyname = 'Owners can view their own tickets';

-- 3. Confirm orders RLS policies exist
SELECT
    'orders RLS policies' AS check_name,
    COUNT(*) AS count,
    CASE WHEN COUNT(*) >= 1 THEN '✅ OK' ELSE '❌ MISSING' END AS status
FROM pg_policies
WHERE tablename = 'orders' AND policyname = 'Buyers can view their own orders';

-- 4. Confirm v_my_transfers view exists
SELECT
    'v_my_transfers view' AS check_name,
    COUNT(*) AS count,
    CASE WHEN COUNT(*) = 1 THEN '✅ OK' ELSE '❌ MISSING — run 10_frontend_helpers.sql' END AS status
FROM information_schema.views
WHERE table_name = 'v_my_transfers';

-- 5. Show all ticket email triggers
SELECT
    'ticket email trigger' AS check_name,
    COUNT(*) AS count,
    CASE WHEN COUNT(*) >= 1 THEN '✅ OK' ELSE '❌ MISSING' END AS status
FROM information_schema.triggers
WHERE trigger_name = 'trigger_send_ticket_email';

-- 6. List organizer profiles (verify statuses look correct)
SELECT id, business_name, organizer_status, organizer_tier, role
FROM profiles
WHERE role IN ('organizer', 'admin')
ORDER BY created_at DESC
LIMIT 20;
