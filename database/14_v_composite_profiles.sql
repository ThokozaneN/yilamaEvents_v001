/*
  # Yilama Events: Composite Profiles View v1.0
  
  ## Purpose:
  Provides a consolidated view of user profiles, merging standard profile data 
  with auth-level metadata (like email verification status).
  This view is required by the frontend Auth and App components.
*/

-- 1. Create the view
create or replace view public.v_composite_profiles as
select 
    p.*,
    u.email_confirmed_at is not null as email_verified
from public.profiles p
left join auth.users u on p.id = u.id;

-- 2. Security & RLS
-- Views in Supabase inherit RLS from underlying tables by default.
-- However, we grant select to authenticated users.
grant select on public.v_composite_profiles to authenticated;
grant select on public.v_composite_profiles to anon;

-- Note: 'profiles' already has RLS:
-- "Public profiles are viewable by everyone" (select using true)
-- "Users can update own profile" (auth.uid() = id)
-- So this view is safe.
