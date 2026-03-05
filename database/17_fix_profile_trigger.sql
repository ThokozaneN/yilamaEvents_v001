/*
  # Yilama Events: Fix Profile Updates Trigger
  
  Updates the `check_profile_updates` trigger to allow the `service_role` 
  (used by the backend) to update protected fields like verification_status 
  and organizer_tier without throwing an error.
*/

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
        
        IF new.verification_status IS DISTINCT FROM old.verification_status THEN
            RAISE EXCEPTION 'You cannot change your own verification status.';
        END IF;
        
        -- Fixed: The original trigger checked 'organizer_status' which doesn't exist, 
        -- it should check 'organizer_tier' which is the correct column name.
        IF new.organizer_tier IS DISTINCT FROM old.organizer_tier THEN
            RAISE EXCEPTION 'You cannot change your own organizer tier.';
        END IF;
    END IF;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql;
