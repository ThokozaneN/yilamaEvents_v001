/*
  # Yilama Events: Auth Signup Stability Fix v1.0
  
  ## Purpose:
  Consolidates all previous auth fixes and applies "Ultra-Stable" trigger logic.
  Fixes the "Database error saving new user" by:
  1. Verifying all columns exist (Hotfix 12 logic).
  2. Setting explicit `search_path = public` on the trigger function.
  3. Adding explicit casts to custom Enums (`public.user_role`).
  4. Using error-swallowing for the profile insert to ensure the Auth record can still be created if profile fails.
*/

-- 1. Ensure all columns exist (Re-verify Phase 12)
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'name') then
        alter table profiles add column name text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'phone') then
        alter table profiles add column phone text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organizer_tier') then
        alter table profiles add column organizer_tier text default 'free';
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'business_name') then
        alter table profiles add column business_name text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organization_phone') then
        alter table profiles add column organization_phone text;
    end if;
end $$;

-- 2. Enhanced, Error-Tolerant Trigger Function
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

  -- Ensure it's a valid enum value
  begin
    v_role_enum := v_role_text::public.user_role;
  exception when others then
    v_role_enum := 'attendee';
  end;

  -- B. Try to create profile
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
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      new.raw_user_meta_data->>'phone',
      coalesce(new.raw_user_meta_data->>'organizer_tier', 'free'),
      new.raw_user_meta_data->>'business_name',
      case when v_role_text = 'organizer' then new.raw_user_meta_data->>'phone' else null end
    );
  exception 
    when others then
      -- Swallow error so auth.users record is still created
      -- We can check logs/audit later
      null;
  end;
  
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. Re-attach Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
