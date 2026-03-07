/*
  # Yilama Events: Auth & Profiles Security Layer v1.0
  
  Dependencies: 01_core_architecture_contract.sql

  ## Tables:
  1. profiles (Extends core table with full identity fields)
  2. organizer_applications (Verification requests)

  ## Security:
  - RLS Policies for self-management
  - Admin-only verification
  - Immutable verified fields
  - Auto-profile creation trigger
*/

-- 1. Extend Profiles Table (Idempotent)
do $$ 
begin
    -- Contact & Socials
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'phone') then
        alter table profiles add column phone text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'avatar_url') then
        alter table profiles add column avatar_url text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'website_url') then
        alter table profiles add column website_url text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'instagram_handle') then
        alter table profiles add column instagram_handle text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'twitter_handle') then
        alter table profiles add column twitter_handle text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'facebook_handle') then
        alter table profiles add column facebook_handle text;
    end if;

    -- Organizer Business Details
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organization_phone') then
        alter table profiles add column organization_phone text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'id_number') then
        alter table profiles add column id_number text;
    end if;
    
    -- Verification Documents
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'id_proof_url') then
        alter table profiles add column id_proof_url text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organization_proof_url') then
        alter table profiles add column organization_proof_url text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'address_proof_url') then
        alter table profiles add column address_proof_url text;
    end if;

    -- Banking Details (Encrypted storage recommended in future, plain text for now as per schema)
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'bank_name') then
        alter table profiles add column bank_name text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'branch_code') then
        alter table profiles add column branch_code text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'account_number') then
        alter table profiles add column account_number text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'account_holder') then
        alter table profiles add column account_holder text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'account_type') then
        alter table profiles add column account_type text;
    end if;

    -- Status & Scoring
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'verification_status') then
        -- Default to 'not_submitted' for new profiles
        alter table profiles add column verification_status text default 'not_submitted'; 
    end if;
     if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organizer_tier') then
        -- We need a type for this if strictly enforced, using text for flexibility or creating enum
        -- Assuming enum 'organizer_tier' doesn't exist yet, we can create it or just use text
        alter table profiles add column organizer_tier text default 'free'; 
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organizer_trust_score') then
        alter table profiles add column organizer_trust_score int default 0;
    end if;
end $$;


-- 2. Organizer Applications Table
create table if not exists organizer_applications (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references profiles(id) on delete cascade not null,
    
    -- Snapshot of submitted details
    business_name text not null,
    id_number text,
    submitted_at timestamptz default now(),
    
    -- Review Process
    status text default 'pending', -- pending, approved, rejected, changes_requested
    reviewer_notes text,
    reviewed_at timestamptz,
    reviewer_id uuid references profiles(id) on delete set null,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 3. Triggers for Automation

-- A. Auto-create Profile on Auth Signup
-- This function runs securely with definer privileges
create or replace function public.handle_new_user() 
returns trigger as $$
declare
  is_organizer boolean;
  final_role user_role;
begin
  -- Resolve role from metadata (frontend sends 'user' or 'organizer')
  is_organizer := (new.raw_user_meta_data->>'role' = 'organizer');
  final_role := case when is_organizer then 'organizer'::user_role else 'attendee'::user_role end;

  insert into public.profiles (
    id, 
    email, 
    role, 
    name,
    business_name,
    phone,
    organization_phone,
    organizer_tier
  )
  values (
    new.id, 
    new.email, 
    final_role, 
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'organization_phone',
    coalesce(new.raw_user_meta_data->>'organizer_tier', 'free')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Attach to auth.users
-- Drop first to be safe/idempotent
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- B. Updated_at Trigger for Applications
drop trigger if exists update_applications_modtime on organizer_applications;
create trigger update_applications_modtime 
  before update on organizer_applications 
  for each row execute procedure update_updated_at_column();


-- 4. RLS Policies

-- Enable RLS
alter table organizer_applications enable row level security;

-- Profiles Policies
drop policy if exists "Public profiles are viewable by everyone" on profiles;
create policy "Public profiles are viewable by everyone" 
  on profiles for select 
  using ( true ); -- Allow public read for now (needed for event pages), or restrict to role='organizer'

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" 
  on profiles for update 
  using ( auth.uid() = id )
  with check ( auth.uid() = id ); 
  -- Note: We prevent role updates via a separate trigger or column-level privileges if strictly needed,
  -- but standard RLS just checks row ownership. 
  -- IMPORTANT: To strictly prevent updating 'role' or 'verification_status', we would use a BEFORE UPDATE trigger
  -- that checks if NEW.role != OLD.role and auth.role() != 'service_role'. 
  -- For this prompt, basic RLS is strictly required.

-- Organizer Applications Policies
drop policy if exists "Users can view own applications" on organizer_applications;
create policy "Users can view own applications"
  on organizer_applications for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can create applications" on organizer_applications;
create policy "Users can create applications"
  on organizer_applications for insert
  with check ( auth.uid() = user_id );

-- Admin Access (Assuming a function or boolean check for admin exists, or specific UUIDs)
-- For simplicity, we can trust the 'role' column in profiles, but we need a secure way to check it.
-- A common pattern is creating an RLS helper function:
create or replace function is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from profiles 
    where id = auth.uid() 
    and role = 'admin'
  );
end;
$$ language plpgsql security definer;

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
  on profiles for select
  using ( is_admin() );

drop policy if exists "Admins can update all profiles" on profiles;
create policy "Admins can update all profiles"
  on profiles for update
  using ( is_admin() );

drop policy if exists "Admins can manage applications" on organizer_applications;
create policy "Admins can manage applications"
  on organizer_applications for all
  using ( is_admin() );

-- 5. Prevent Role Escalation (Secure Trigger)
create or replace function check_profile_updates()
returns trigger as $$
begin
    -- If user is NOT admin, prevent changing sensitive fields
    if not is_admin() then
        if new.role is distinct from old.role then
            raise exception 'You cannot change your own role.';
        end if;
        if new.verification_status is distinct from old.verification_status then
            raise exception 'You cannot change your own verification status.';
        end if;
         if new.organizer_status is distinct from old.organizer_status then
            raise exception 'You cannot change your own organizer status.';
        end if;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists protect_profile_fields on profiles;
create trigger protect_profile_fields
    before update on profiles
    for each row
    execute procedure check_profile_updates();
