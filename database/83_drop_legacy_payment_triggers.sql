-- =============================================================================
-- 83_drop_legacy_payment_triggers.sql
--
-- Hotfix: Resolves "operator does not exist: uuid = text" error in PayFast ITN.
-- Drops legacy v1 ledger triggers on the payments table that erroneously 
-- compare UUIDs to TEXT without casting.
-- The modern v2 ledger system now safely uses the `orders` table trigger 
-- (`ledger_on_order_paid` from migration 76) instead.
-- =============================================================================

DROP TRIGGER IF EXISTS on_payment_completed ON payments;
DROP TRIGGER IF EXISTS on_payment_inserted_completed ON payments;
DROP FUNCTION IF EXISTS process_payment_settlement();
