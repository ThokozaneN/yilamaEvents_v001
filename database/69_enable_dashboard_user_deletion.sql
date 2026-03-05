-- 69_enable_dashboard_user_deletion.sql
-- 
-- Allows deleting test users from the Supabase Auth dashboard by adding
-- ON DELETE CASCADE to the financial tables constraint.
--
-- NOTE: In a strict production environment, financial records should never 
-- be deleted (users should be soft-deleted instead). This change allows
-- clean testing by wiping all associated financial data when a user is deleted.

-- 1. Financial Transactions
ALTER TABLE financial_transactions
DROP CONSTRAINT IF EXISTS financial_transactions_wallet_user_id_fkey;

ALTER TABLE financial_transactions
ADD CONSTRAINT financial_transactions_wallet_user_id_fkey
FOREIGN KEY (wallet_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 2. Payouts (if organizer is deleted)
ALTER TABLE payouts
DROP CONSTRAINT IF EXISTS payouts_organizer_id_fkey;

ALTER TABLE payouts
ADD CONSTRAINT payouts_organizer_id_fkey
FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 3. Resale & Transfers (if ticket sender/recipient is deleted)
ALTER TABLE ticket_transfers
DROP CONSTRAINT IF EXISTS ticket_transfers_sender_user_id_fkey;
ALTER TABLE ticket_transfers
ADD CONSTRAINT ticket_transfers_sender_user_id_fkey
FOREIGN KEY (sender_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ticket_transfers
DROP CONSTRAINT IF EXISTS ticket_transfers_recipient_user_id_fkey;
ALTER TABLE ticket_transfers
ADD CONSTRAINT ticket_transfers_recipient_user_id_fkey
FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE CASCADE;


