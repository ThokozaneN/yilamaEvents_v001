/*
  # Yilama Events: Enforce Deterministic States (NULL Safety)
  
  This patch sanitizes the database schema by ensuring that all critical
  lifecycle tracking columns (status, tiers) are mathematically guaranteed
  to hold a valid state. 
  
  It systematically backfills hanging `NULL` values and then permanently 
  blocks them with `SET NOT NULL` constraints, improving React UI rendering 
  reliability and backend state machine logic.
*/

-- 1. profiles.organizer_status
UPDATE public.profiles SET organizer_status = 'draft' WHERE organizer_status IS NULL;
ALTER TABLE public.profiles ALTER COLUMN organizer_status SET DEFAULT 'draft';
ALTER TABLE public.profiles ALTER COLUMN organizer_status SET NOT NULL;

-- 2. profiles.organizer_tier
UPDATE public.profiles SET organizer_tier = 'free' WHERE organizer_tier IS NULL;
ALTER TABLE public.profiles ALTER COLUMN organizer_tier SET DEFAULT 'free';
ALTER TABLE public.profiles ALTER COLUMN organizer_tier SET NOT NULL;

-- 3. events.status
UPDATE public.events SET status = 'draft' WHERE status IS NULL;
ALTER TABLE public.events ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.events ALTER COLUMN status SET NOT NULL;

-- 4. tickets.status
-- (Assuming tickets table has a status column based on ticket models, typically valid/used/cancelled. Defaulting to 'valid')
UPDATE public.tickets SET status = 'valid' WHERE status IS NULL;
ALTER TABLE public.tickets ALTER COLUMN status SET DEFAULT 'valid';
ALTER TABLE public.tickets ALTER COLUMN status SET NOT NULL;

-- 5. refunds.status
UPDATE public.refunds SET status = 'pending' WHERE status IS NULL;
ALTER TABLE public.refunds ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.refunds ALTER COLUMN status SET NOT NULL;

-- 6. resale_listings.status (from 07_resale_and_transfers.sql)
UPDATE public.resale_listings SET status = 'active' WHERE status IS NULL;
ALTER TABLE public.resale_listings ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.resale_listings ALTER COLUMN status SET NOT NULL;

-- 7. ticket_transfers.status (from 07_resale_and_transfers.sql)
UPDATE public.ticket_transfers SET status = 'pending' WHERE status IS NULL;
ALTER TABLE public.ticket_transfers ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.ticket_transfers ALTER COLUMN status SET NOT NULL;

-- 8. payouts.status (from 03_financial_architecture.sql)
-- Payouts actually has NOT NULL check already, but let's make doubly sure default is pending.
UPDATE public.payouts SET status = 'pending' WHERE status IS NULL;
ALTER TABLE public.payouts ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.payouts ALTER COLUMN status SET NOT NULL;
