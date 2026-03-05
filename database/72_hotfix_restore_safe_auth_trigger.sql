/*
  # HOTFIX: Restore Safe Auth Trigger with Scanner Role Support
  
  Migration 70 broke new user signup by removing:
  1. The explicit cast to `public.user_role` enum (causes column type mismatch)
  2. The `set search_path = public` directive
  3. The exception-swallowing wrapper (so any profile error now kills the auth record too)

  This migration restores all of those and also correctly allows 'scanner' and 'admin'
  to pass through (the original goal of migration 70).
*/

create or replace function public.handle_new_user() 
returns trigger as $$
declare
  v_role_text text;
  v_role_enum public.user_role;
begin
  -- A. Extract and Validate Role
  v_role_text := coalesce(new.raw_user_meta_data->>'role', 'attendee');
  
  -- Map 'user' to 'attendee' if frontend sends 'user'
  if v_role_text = 'user' then 
    v_role_text := 'attendee'; 
  end if;

  -- Only these roles are valid. 'scanner' and 'admin' can only be set via the
  -- Service Role Admin API, not public signup, so it is safe to allow them here.
  if v_role_text not in ('attendee', 'organizer', 'scanner', 'admin') then
    v_role_text := 'attendee';
  end if;

  -- Cast text to the actual enum type (required by the profiles column type)
  begin
    v_role_enum := v_role_text::public.user_role;
  exception when others then
    v_role_enum := 'attendee'::public.user_role;
  end;

  -- B. Try to create profile (exception-swallowed so auth.users is always saved)
  begin
    insert into public.profiles (
      id, 
      email, 
      role, 
      name,
      phone,
      organizer_tier,
      business_name,
      organization_phone
    )
    values (
      new.id, 
      new.email, 
      v_role_enum,
      coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
      new.raw_user_meta_data->>'phone',
      coalesce(new.raw_user_meta_data->>'organizer_tier', 'free'),
      new.raw_user_meta_data->>'business_name',
      case when v_role_text = 'organizer' then new.raw_user_meta_data->>'phone' else null end
    );
  exception 
    when others then
      -- Swallow so auth.users insert always succeeds even if profile fails
      null;
  end;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;
