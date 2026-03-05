-- 67_fix_composite_profiles_security.sql
--
-- Fixes 403 Forbidden on v_composite_profiles for authenticated users.
--
-- Root cause: The view does `LEFT JOIN auth.users u ON p.id = u.id`.
-- Postgres executes views as SECURITY INVOKER by default — meaning the join
-- runs as the calling user (authenticated role), which does NOT have SELECT
-- on auth.users. This causes a 403 when any code reads v_composite_profiles.
--
-- Fix: Add SECURITY DEFINER so the view executes as its owner (postgres),
-- who can read auth.users. The RLS on the underlying `profiles` table still
-- applies because we're selecting from public.profiles.

CREATE OR REPLACE VIEW public.v_composite_profiles
WITH (security_invoker = false) -- SECURITY DEFINER: runs as view owner (postgres)
AS
SELECT
    p.*,
    u.email_confirmed_at IS NOT NULL AS email_verified
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id;

-- Re-apply grants (view replacement drops them)
REVOKE SELECT ON public.v_composite_profiles FROM anon;
GRANT SELECT ON public.v_composite_profiles TO authenticated;
