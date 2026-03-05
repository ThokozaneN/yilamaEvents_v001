/*
  # Yilama Events: Enhanced Auth Trigger v1.1
  
  Dependencies: 02_auth_and_profiles.sql

  ## Purpose:
  Updates the `handle_new_user` trigger to captute user metadata passed during signup.
  This ensures that when a user signs up with a role (e.g. 'organizer') or phone number,
  it is correctly persisted to the `profiles` table immediately.

*/

create or replace function public.handle_new_user() 
returns trigger as $$
declare
  v_role text;
  v_phone text;
  v_tier text;
  v_business_name text;
begin
  -- Extract metadata with defaults
  v_role := coalesce(new.raw_user_meta_data->>'role', 'attendee');
  v_phone := new.raw_user_meta_data->>'phone';
  v_tier := coalesce(new.raw_user_meta_data->>'organizer_tier', 'free');
  v_business_name := new.raw_user_meta_data->>'business_name';

  -- Security: Validate Role (Only allow 'attendee' or 'organizer' via public signup)
  if v_role not in ('attendee', 'organizer') then
    v_role := 'attendee';
  end if;

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
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_phone,
    v_tier,
    v_business_name,
    case when v_role = 'organizer' then v_phone else null end -- Use phone as org phone if organizer
  );
  
  return new;
end;
$$ language plpgsql security definer;
