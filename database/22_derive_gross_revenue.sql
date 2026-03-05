/*
  # Yilama Events: Phase 1 - Derive Revenue
  
  Removes the physically stored `gross_revenue` column from `events` 
  and replaces it with a Computed Column function `gross_revenue(events)` 
  driven by the immutable `financial_transactions` ledger.
*/

-- 1. Drop the hard-coded column (which causes financial drift)
ALTER TABLE events DROP COLUMN IF EXISTS gross_revenue;

-- 2. Create the Computed Column RPC
-- Supabase automatically maps functions like `function_name(table_name)` 
-- to be selectable exactly as if they were columns in a GraphQL/PostgREST query.
CREATE OR REPLACE FUNCTION gross_revenue(event events)
RETURNS numeric(10,2) AS $$
DECLARE
    total numeric(10,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0.00) INTO total
    FROM financial_transactions ft
    JOIN orders o ON o.id = ft.reference_id
    WHERE ft.reference_type = 'order'
      AND ft.type = 'credit' -- Assuming credits represent income
      AND o.event_id = event.id;

    RETURN total;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Optional Index boost for the join
CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id);
