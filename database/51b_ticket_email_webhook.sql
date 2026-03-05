-- 51_ticket_email_webhook.sql
-- We will replace the custom pg_net approach with the native Supabase Webhooks system
-- Supabase handles event triggers internally and dispatches them reliably to Edge Functions.

-- Note: The most reliable way to create a Supabase Database Webhook programmatically 
-- is NOT by writing raw pg_net triggers, but by using the Supabase Dashboard UI (Database -> Webhooks).
-- Since we are doing this via SQL, we will write the exact same trigger structure that Supabase generates internally.

DROP TRIGGER IF EXISTS trigger_send_ticket_email ON orders;
DROP FUNCTION IF EXISTS execute_ticket_email_webhook();

CREATE OR REPLACE FUNCTION execute_ticket_email_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload jsonb;
  v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/send-ticket-email';
  v_anon_key text;
BEGIN
  -- Build the standard Supabase payload
  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  -- Retrieve the anon key from vault so we can pass it to the Edge Function (which Supabase requires for CORS/API gateway)
  BEGIN
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  EXCEPTION WHEN OTHERS THEN
    v_anon_key := 'unknown';
  END;

  -- Fire the webhook asynchronously using pg_net
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, 'unknown')
    ),
    body := v_payload
  );

  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trigger_send_ticket_email
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'paid' AND NEW.status = 'paid')
  EXECUTE FUNCTION execute_ticket_email_webhook();
