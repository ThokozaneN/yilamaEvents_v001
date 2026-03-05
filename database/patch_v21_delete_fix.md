# Database Migration Patch: Cascade Delete Fix

If you are receiving an error saying `Key (id)=... is still referenced from table tickets` when trying to delete an event, run this SQL script in your **Supabase SQL Editor**. 

This script updates your existing foreign key constraints to support **Cascading Deletes**. This means when you delete an event, all associated ticket tiers and sold tickets will be cleaned up automatically.

### The Fix SQL

```sql
-- ========================================================
-- YILAMA EVENTS: CASCADE DELETE PATCH
-- ========================================================

-- 1. Fix Tiers reference to Events
-- Allows tiers to be deleted automatically when an event is removed.
ALTER TABLE public.ticket_types 
DROP CONSTRAINT IF EXISTS ticket_types_event_id_fkey;

ALTER TABLE public.ticket_types 
ADD CONSTRAINT ticket_types_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES public.events(id) 
ON DELETE CASCADE;

-- 2. Fix Tickets reference to Events
-- Allows tickets to be deleted automatically when an event is removed.
ALTER TABLE public.tickets 
DROP CONSTRAINT IF EXISTS tickets_event_id_fkey;

ALTER TABLE public.tickets 
ADD CONSTRAINT tickets_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES public.events(id) 
ON DELETE CASCADE;

-- 3. Fix Tickets reference to Ticket Types
-- If a specific tier (like "VIP") is deleted but the event remains, 
-- we keep the ticket but set the tier_id to NULL.
ALTER TABLE public.tickets 
DROP CONSTRAINT IF EXISTS tickets_ticket_type_id_fkey;

ALTER TABLE public.tickets 
ADD CONSTRAINT tickets_ticket_type_id_fkey 
FOREIGN KEY (ticket_type_id) 
REFERENCES public.ticket_types(id) 
ON DELETE SET NULL;
```

### How to use this
1. Open your **Supabase Dashboard**.
2. Go to the **SQL Editor** tab on the left sidebar.
3. Create a **New Query**.
4. Paste the code above and click **Run**.
5. You can now delete events from the Organizer Dashboard without constraint errors.

---
*Note: This patch is additive and safe to run on existing data. It does not delete any records; it only updates the rules for future deletions.*
