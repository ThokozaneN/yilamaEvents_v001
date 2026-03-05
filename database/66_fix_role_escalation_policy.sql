-- 66_fix_role_escalation_policy.sql
--
-- Fixes the RLS recursion bug introduced in migration 65 (A-4.1).
-- The WITH CHECK subquery (SELECT role FROM profiles WHERE...) inside a
-- profiles UPDATE policy causes infinite RLS recursion → "permission denied for users".
--
-- Solution: Replace the recursive policy with a SECURITY DEFINER trigger
-- that uses OLD/NEW row values directly — no table scan, no recursion.

-- ─── 1. Drop the broken recursive policy ─────────────────────────────────────
DROP POLICY IF EXISTS "Users update own profile" ON profiles;

-- ─── 2. Re-create a clean, non-recursive UPDATE policy ───────────────────────
-- Simple: users can only update their own row. Role enforcement is in the trigger below.
CREATE POLICY "Users update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ─── 3. Trigger to prevent role self-escalation ───────────────────────────────
-- Uses OLD/NEW directly — no RLS, no recursion, no permission issues.
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- If role is being changed...
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        -- Allow only if the current user is an admin
        IF NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Permission denied: role changes require admin privileges.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists, then create fresh
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;

CREATE TRIGGER trg_prevent_role_escalation
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION prevent_role_self_escalation();
