/*
  # Yilama Events: Restrict Composite Profiles Data Exposure
  
  This patch hardens the `v_composite_profiles` view by immediately
  revoking its unrestricted public SELECT privilege from the `anon` role.
  
  It introduces `v_public_profiles`, a safe, marketing-ready subset of profile
  data explicitly designed for public consumption (Event Discovery, Organizer profiles).
*/

-- 1. Revoke Anon access to the full composite view (contains email, phone, verification statuses)
REVOKE SELECT ON public.v_composite_profiles FROM anon;

-- Ensure authenticated users retain access to their composite data
GRANT SELECT ON public.v_composite_profiles TO authenticated;

-- 2. Create the Publicly Safe Profiles View
CREATE OR REPLACE VIEW public.v_public_profiles AS
SELECT 
    id,
    name,
    business_name,
    avatar_url,
    website_url,
    instagram_handle,
    twitter_handle,
    facebook_handle,
    organizer_tier,
    organizer_trust_score,
    created_at
FROM public.profiles;

-- 3. Grant Anon and Authenticated access to the safe view
GRANT SELECT ON public.v_public_profiles TO anon;
GRANT SELECT ON public.v_public_profiles TO authenticated;
