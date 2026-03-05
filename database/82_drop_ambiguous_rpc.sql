-- =============================================================================
-- 82_drop_ambiguous_rpc.sql
--
-- Hotfix: Resolves "Could not choose the best candidate function" error in PayFast ITN.
-- Drops the old UUID-signature version of confirm_order_payment so the 
-- Edge Function unambiguously calls the correct TEXT-signature version 
-- created in migration 81.
-- =============================================================================

-- Drop the old version that causes the collision
DROP FUNCTION IF EXISTS public.confirm_order_payment(uuid, text, text);

-- (The text version from 81_fix_itn_casting.sql remains active and handles the UUID casting internally)
