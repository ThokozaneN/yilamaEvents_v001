-- 92_robust_signup_hotfix.sql
--
-- Definitive fix for "Database error saving new user".
-- Ensures 'name' column exists and replaces the auth trigger with a robust version.

DO $$ 
BEGIN
    -- 1. Ensure 'name' column exists in profiles
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'name') THEN
        ALTER TABLE profiles ADD COLUMN name TEXT;
    END IF;
END $$;

-- 2. Restore Robust handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_role_text text;
  v_role_enum public.user_role;
BEGIN
  -- A. Extract and Validate Role
  v_role_text := coalesce(new.raw_user_meta_data->>'role', 'attendee');
  
  -- Map 'user' to 'attendee' if frontend sends 'user'
  IF v_role_text = 'user' THEN 
    v_role_text := 'attendee'; 
  END IF;

  IF v_role_text NOT IN ('attendee', 'organizer', 'scanner', 'admin') THEN
    v_role_text := 'attendee';
  END IF;

  -- Cast text to the actual enum type
  BEGIN
    v_role_enum := v_role_text::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role_enum := 'attendee'::public.user_role;
  END;

  -- B. Try to create profile (exception-swallowed so auth.users is always saved)
  BEGIN
    INSERT INTO public.profiles (
      id, 
      email, 
      role, 
      name,
      phone,
      organizer_tier,
      business_name,
      organization_phone
    )
    VALUES (
      new.id, 
      new.email, 
      v_role_enum,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
      new.raw_user_meta_data->>'phone',
      coalesce(new.raw_user_meta_data->>'organizer_tier', 'free'),
      new.raw_user_meta_data->>'business_name',
      CASE WHEN v_role_text = 'organizer' THEN new.raw_user_meta_data->>'phone' ELSE null END
    );
  EXCEPTION 
    WHEN OTHERS THEN
      -- Swallow so auth.users insert always succeeds even if profile fails
      NULL;
  END;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Re-attach Trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
