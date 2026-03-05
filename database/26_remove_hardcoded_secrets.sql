/*
  # Yilama Events: Remove Hardcoded Secrets
  
  This patch removes the hardcoded Supabase Anon Key from the
  `trigger_notify_verification_result` webhook function to comply
  with security hygiene best practices.
  
  The function now safely defaults to `current_setting('app.settings.anon_key', true)`
  and gracefully shuts down if the key is missing rather than crashing the database.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
    v_email text;
    v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/notify-verification-result';
    -- DYNAMICALLY fetch the key from postgres internal settings instead of hardcoding
    v_anon_key text := current_setting('app.settings.anon_key', true);
BEGIN
    IF old.organizer_status IS DISTINCT FROM new.organizer_status 
       AND new.organizer_status IN ('verified', 'rejected', 'suspended') THEN
        
        v_email := new.email;
        
        -- SECURE FALLBACK: Only execute if the database has been configured with an anon_key
        IF v_email IS NOT NULL AND v_anon_key IS NOT NULL AND v_anon_key != '' THEN
            PERFORM net.http_post(
                url := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_anon_key
                ),
                body := jsonb_build_object(
                    'to', v_email,
                    'name', COALESCE(new.business_name, new.name, 'Organizer'),
                    'decision', new.organizer_status
                )
            );
        END IF;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
