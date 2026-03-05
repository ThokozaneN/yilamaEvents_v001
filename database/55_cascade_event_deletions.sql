-- 55_cascade_event_deletions.sql
--
-- Fixes the foreign key constraint violations when an organizer deletes an event.
-- By default, `orders` restricted deletion if they were tied to an event.
-- We update the constraints to cascade deletions so that deleting an event 
-- also cleans up its orders, payments, fees, and order_items.

-- 1. Orders -> Events (Change RESTRICT to CASCADE)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_event_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_event_id_fkey 
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- 2. Payments -> Orders (Change RESTRICT to CASCADE)
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_order_id_fkey 
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- 3. Order Items -> Orders (Ensure CASCADE)
-- (Already ON DELETE CASCADE in 03 schema, but we'll ensure it here defensively just in case)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey 
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- 4. Platform Fees -> Orders (Ensure CASCADE)
ALTER TABLE platform_fees DROP CONSTRAINT IF EXISTS platform_fees_order_id_fkey;
ALTER TABLE platform_fees ADD CONSTRAINT platform_fees_order_id_fkey 
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- 5. Refunds -> Payments (Ensure CASCADE)
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_payment_id_fkey;
ALTER TABLE refunds ADD CONSTRAINT refunds_payment_id_fkey 
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;

-- 6. Order Items -> Tickets (Change RESTRICT to CASCADE)
-- Tickets are deleted when events are deleted (via event_id CASCADE). 
-- This ensures order_items linked to those tickets are also cleaned up.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_ticket_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_ticket_id_fkey 
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
