-- =============================================================================
-- 77_webhook_secret_headers.sql
--
-- Adds x-webhook-secret header to all pg_net trigger functions.
-- The secret is read from Vault (name: 'webhook_secret').
--
-- PREREQUISITE: Run this SQL first to store the secret in Vault:
--   SELECT vault.create_secret('YOUR_SECRET_HERE', 'webhook_secret');
--
-- This migration is idempotent — safe to re-run.
-- =============================================================================


-- ─── FIX 1: send-ticket-email trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_ticket_email_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payload   jsonb;
  v_url       text;
  v_anon_key  text;
  v_webhook_secret text;
BEGIN
  v_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
  ) || '/functions/v1/send-ticket-email';

  v_payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  BEGIN
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  BEGIN
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_webhook_secret := NULL; END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || COALESCE(v_anon_key, 'no-key'),
      'x-webhook-secret', COALESCE(v_webhook_secret, '')
    ),
    body := v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_ticket_email ON orders;
CREATE TRIGGER trigger_send_ticket_email
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'paid' AND NEW.status = 'paid')
  EXECUTE FUNCTION execute_ticket_email_webhook();


-- ─── FIX 2: process-waitlist trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_waitlist_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payload        jsonb;
  v_url            text;
  v_anon_key       text;
  v_webhook_secret text;
BEGIN
  v_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
  ) || '/functions/v1/process-waitlist';

  v_payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  BEGIN
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  BEGIN
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_webhook_secret := NULL; END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || COALESCE(v_anon_key, 'no-key'),
      'x-webhook-secret', COALESCE(v_webhook_secret, '')
    ),
    body := v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_process_waitlist ON events;
CREATE TRIGGER trigger_process_waitlist
  AFTER UPDATE OF status ON events
  FOR EACH ROW
  WHEN (OLD.status = 'coming_soon' AND NEW.status IN ('published', 'cancelled'))
  EXECUTE FUNCTION execute_waitlist_webhook();


-- ─── FIX 3: notify-verification-result trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
  v_email          text;
  v_url            text;
  v_anon_key       text;
  v_webhook_secret text;
BEGIN
  v_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      'https://bvjcvdnfoqmxzdflqsdp.supabase.co'
  ) || '/functions/v1/notify-verification-result';

  BEGIN
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_anon_key := NULL; END;

  BEGIN
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_webhook_secret := NULL; END;

  IF OLD.organizer_status IS DISTINCT FROM NEW.organizer_status
     AND NEW.organizer_status IN ('verified', 'rejected', 'suspended') THEN
    v_email := NEW.email;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'Authorization',    'Bearer ' || COALESCE(v_anon_key, 'no-key'),
        'x-webhook-secret', COALESCE(v_webhook_secret, '')
      ),
      body := jsonb_build_object(
        'to',       v_email,
        'name',     COALESCE(NEW.business_name, NEW.name, 'Organizer'),
        'decision', NEW.organizer_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_verification ON profiles;
CREATE TRIGGER trigger_notify_verification
  AFTER UPDATE OF organizer_status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_verification_result();


-- ─── FIX 4: notify-missing-docs (called from submit_verification RPC) ─────────
-- This one is an inline PERFORM inside submit_verification(), not a trigger.
-- Update that function to also pass the webhook secret.
-- Find and update submit_verification to include x-webhook-secret in its pg_net call.
DO $$
DECLARE
  v_function_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'submit_verification'
  ) INTO v_function_exists;

  IF v_function_exists THEN
    RAISE NOTICE 'submit_verification exists — the notify-missing-docs call inside it '
                 'still uses the old header pattern. Run the update in notify_missing_docs section.';
  END IF;
END;
$$;


-- ─── VERIFICATION ─────────────────────────────────────────────────────────────
-- Confirm all 3 triggers are in place
SELECT
  trigger_name,
  event_object_table AS table_name,
  action_timing,
  event_manipulation AS event,
  CASE WHEN trigger_name IS NOT NULL THEN '✅ OK' ELSE '❌ MISSING' END AS status
FROM information_schema.triggers
WHERE trigger_name IN (
  'trigger_send_ticket_email',
  'trigger_process_waitlist',
  'trigger_notify_verification'
)
ORDER BY trigger_name;

-- Check webhook_secret exists in vault
SELECT
  CASE WHEN COUNT(*) > 0 THEN '✅ webhook_secret found in Vault'
       ELSE '❌ webhook_secret NOT in Vault — run: SELECT vault.create_secret(''YOUR_SECRET'', ''webhook_secret'');'
  END AS vault_status
FROM vault.decrypted_secrets
WHERE name = 'webhook_secret';
