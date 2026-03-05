-- 53_fix_ambiguous_purchase_tickets.sql
-- 
-- Fixes the Postgres ambiguity error: "Could not choose the best candidate function between..."
-- Drops all older/conflicting overloaded versions of the purchase_tickets RPC
-- leaving only the definitive 9-parameter uuid[] version (from 51_seating_rpc_updates.sql)

-- Drop the 8-parameter version (from 49_fix_purchase_tickets_user_id.sql)
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid);

-- Drop the 7-parameter version (from 32_purchase_tickets_rpc.sql)
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text);

-- Drop the 9-parameter TEXT[] version (conflicts with the uuid[] version when seat_ids is null)
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid, text[]);
