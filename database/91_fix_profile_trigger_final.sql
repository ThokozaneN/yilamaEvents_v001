-- 91_fix_profile_trigger_final.sql
--
-- Applies the fixed check_profile_updates trigger to allow organizers to save 
-- their profiles while still protecting sensitive fields.

CREATE OR REPLACE FUNCTION check_profile_updates()
RETURNS trigger AS $$
BEGIN
    -- 1. Allow bypass for the backend service role, postgres admin, or supabase admin
    IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
        RETURN new;
    END IF;

    -- 2. If user is NOT an admin, prevent changing sensitive fields
    IF NOT is_admin() THEN
        -- Prevent role change
        IF new.role IS DISTINCT FROM old.role THEN
            RAISE EXCEPTION 'You cannot change your own role.';
        END IF;
        
        -- Prevent verification status change (must be done by admin or backend)
        -- We check both column naming variations to be safe against schema changes
        IF (new.verification_status IS DISTINCT FROM old.verification_status) 
           OR (new.organizer_status IS DISTINCT FROM old.organizer_status) THEN
            RAISE EXCEPTION 'You cannot change your own verification or organizer status.';
        END IF;
        
        -- Prevent tier changes (must be done via paid flow/backend)
        IF new.organizer_tier IS DISTINCT FROM old.organizer_tier THEN
            RAISE EXCEPTION 'You cannot change your own organizer tier.';
        END IF;
    END IF;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is attached correctly
DROP TRIGGER IF EXISTS protect_profile_fields ON profiles;
CREATE TRIGGER protect_profile_fields
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE PROCEDURE check_profile_updates();
