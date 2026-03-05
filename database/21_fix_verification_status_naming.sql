/*
  # Yilama Events: Master Schema Naming Inconsistency Fix
  
  Safely replaces all incorrect references to `verification_status` 
  with the canonical `organizer_status` column.
*/

-- 1. Fix is_organizer_ready RPC
CREATE OR REPLACE FUNCTION is_organizer_ready(org_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_status text;
BEGIN
    SELECT organizer_status INTO v_status FROM profiles WHERE id = org_id;
    
    -- Ensure case-insensitivity and handle nulls
    RETURN jsonb_build_object(
        'ready', (COALESCE(LOWER(v_status), '') = 'verified'),
        'missing', CASE WHEN COALESCE(LOWER(v_status), '') = 'verified' THEN '[]'::jsonb ELSE '["verification_pending"]'::jsonb END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. Fix check_profile_updates Trigger Function
CREATE OR REPLACE FUNCTION check_profile_updates()
RETURNS trigger AS $$
BEGIN
    -- Allow bypass for the backend service role, postgres admin, or supabase admin
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN new;
    END IF;

    -- If user is NOT an admin, prevent changing sensitive fields
    IF NOT is_admin() THEN
        IF new.role IS DISTINCT FROM old.role THEN
            RAISE EXCEPTION 'You cannot change your own role.';
        END IF;
        
        IF new.organizer_status IS DISTINCT FROM old.organizer_status THEN
            RAISE EXCEPTION 'You cannot change your own organizer status.';
        END IF;
        
        IF new.organizer_tier IS DISTINCT FROM old.organizer_tier THEN
            RAISE EXCEPTION 'You cannot change your own organizer tier.';
        END IF;
    END IF;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql;


-- 3. Fix trigger_notify_verification_result Webhook Function
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
    v_email text;
    v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/notify-verification-result';
    v_anon_key text;
BEGIN
    -- Try to get from Vault first, fallback to current_setting for backwards compatibility
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    IF v_anon_key IS NULL THEN
        v_anon_key := current_setting('app.settings.anon_key', true);
    END IF;

    -- Check if we are actually transitioning the status
    IF old.organizer_status IS DISTINCT FROM new.organizer_status 
       AND new.organizer_status IN ('verified', 'rejected', 'suspended') THEN
        
        -- Use the email from the profiles table, which mirrors auth.users
        v_email := new.email;
        
        IF v_email IS NOT NULL THEN
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


-- 4. Rebind Webhook Trigger
DROP TRIGGER IF EXISTS trigger_notify_verification ON profiles;
CREATE TRIGGER trigger_notify_verification
AFTER UPDATE OF organizer_status ON profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_notify_verification_result();


-- 5. Fix log_profile_changes Audit Trigger
CREATE OR REPLACE FUNCTION log_profile_changes()
RETURNS trigger AS $$
BEGIN
    -- Log sensitive field changes
    if (old.role is distinct from new.role) or 
       (old.organizer_status is distinct from new.organizer_status) or 
       (old.organizer_tier is distinct from new.organizer_tier) then
        
        insert into audit_logs (
            user_id, 
            action, 
            details
        ) values (
            new.id,
            'security_update',
            jsonb_build_object(
                'old_status', old.organizer_status, 
                'new_status', new.organizer_status, 
                'old_role', old.role, 
                'new_role', new.role,
                'old_tier', old.organizer_tier,
                'new_tier', new.organizer_tier
            )
        );
    end if;
    return new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
