-- =============================================================================
-- 85_fix_ticket_email_trigger.sql
--
-- Resolves the silent failure where the 'send-ticket-email' Edge Function
-- is not being successfully invoked by the PostgreSQL trigger because
-- the 'anon_key' vault lookup fails or returns null.
--
-- Since the edge function is now deployed with `--no-verify-jwt`, we just
-- need to ensure the payload is successfully dispatched with the 
-- x-webhook-secret.
-- =============================================================================

CREATE OR REPLACE FUNCTION execute_ticket_email_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payload   jsonb;
  v_url       text;
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
    SELECT decrypted_secret INTO v_webhook_secret
    FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_webhook_secret := NULL; END;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-webhook-secret', COALESCE(v_webhook_secret, '')
    ),
    body := v_payload
  );
  
  RETURN NEW;
END;
$$;
