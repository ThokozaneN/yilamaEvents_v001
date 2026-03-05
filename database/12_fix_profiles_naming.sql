/*
  # Yilama Events: Profiles Schema Hotfix v1.0
  
  ## Problem:
  Signup fails with "Database error saving new user" because the `handle_new_user` 
  trigger tries to insert into a `name` column that does not exist in the foundational schema.

  ## Solution:
  1. Add `name` column to `profiles` table.
  2. Ensure all other columns used in the enhanced trigger exist.
*/

do $$ 
begin
    -- 1. Add 'name' if missing
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'name') then
        alter table profiles add column name text;
    end if;

    -- 2. Add 'business_name' if missing (already in 01 contract, but safe to check)
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'business_name') then
        alter table profiles add column business_name text;
    end if;

     -- 3. Add 'phone' if missing (already in 02 auth, but safe to check)
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'phone') then
        alter table profiles add column phone text;
    end if;

    -- 4. Add 'organizer_tier' if missing
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organizer_tier') then
        alter table profiles add column organizer_tier text default 'free';
    end if;

    -- 5. Add 'organization_phone' if missing
    if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'organization_phone') then
        alter table profiles add column organization_phone text;
    end if;

end $$;
