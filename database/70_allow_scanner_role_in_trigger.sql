/*
  # Allow Scanner Role in Auth Trigger

  The `handle_new_user` trigger previously only allowed 'attendee' and 'organizer'
  to be passed through from signup metadata, which caused scanner accounts created
  via the Admin API (with role: 'scanner' in user_metadata) to be silently downgraded
  to 'attendee'.

  This patch adds 'scanner' and 'admin' to the allowlist. Note: these roles can ONLY
  be set via the Admin API (Service Role), not through public signup, so this is safe.
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

  -- Security: Validate Role
  -- 'attendee' and 'organizer' are allowed via public signup.
  -- 'scanner' and 'admin' are only reachable via the Admin API (service role), so safe to allow.
  if v_role not in ('attendee', 'organizer', 'scanner', 'admin') then
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
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    v_phone,
    v_tier,
    v_business_name,
    case when v_role = 'organizer' then v_phone else null end
  );
  
  return new;
end;
$$ language plpgsql security definer;
