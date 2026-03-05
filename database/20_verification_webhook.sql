/*
  # Yilama Events: Verification Result Webhook
  
  Creates a trigger to automatically call the `notify-verification-result`
  Edge Function whenever an organizer's verification status changes.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
    v_email text;
    v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/notify-verification-result';
    v_anon_key text;
BEGIN
    -- Try to get from Vault first, fallback to current_setting
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    IF v_anon_key IS NULL THEN
        v_anon_key := current_setting('app.settings.anon_key', true);
    END IF;

    -- Check if we are actually transitioning the status
    IF old.organizer_status IS DISTINCT FROM new.organizer_status 
       AND new.organizer_status IN ('verified', 'rejected', 'suspended') THEN
        
        -- Use the email from the profiles table, which mirrors auth.users
        v_email := new.email;
        
        IF v_email IS NOT NULL AND v_anon_key IS NOT NULL AND v_anon_key != '' THEN
            -- Fire off the Webhook to the Edge Function async
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_verification ON profiles;
CREATE TRIGGER trigger_notify_verification
AFTER UPDATE OF organizer_status ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_notify_verification_result();
