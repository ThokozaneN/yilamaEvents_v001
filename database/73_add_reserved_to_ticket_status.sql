/*
  # Add 'reserved' to ticket_status enum

  The purchase_tickets RPC (from 55_payment_security_hardening.sql onwards) sets
  ticket status to 'reserved' during checkout, but 'reserved' was never added to
  the ticket_status enum defined in 01_core_architecture_contract.sql.

  This migration adds the missing value.
  
  NOTE: In PostgreSQL, ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
  If using Supabase SQL editor, this will work fine (it runs each statement outside
  an implicit transaction).
*/

ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'reserved';
