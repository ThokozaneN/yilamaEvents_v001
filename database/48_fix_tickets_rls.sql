-- 48_fix_tickets_rls.sql
-- CRITICAL: Adds the missing RLS policies for the tickets and orders tables.
-- RLS was enabled (blocking all access) but no policies were ever defined.
-- This caused the wallet to silently return empty results after purchase.

-- ─── TICKETS ─────────────────────────────────────────────────────────────────

-- Owners can view their own tickets
CREATE POLICY "Owners can view their own tickets"
    ON tickets FOR SELECT
    USING (owner_user_id = auth.uid());

-- Organizers can view tickets for their events
CREATE POLICY "Organizers can view tickets for their events"
    ON tickets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = tickets.event_id
            AND events.organizer_id = auth.uid()
        )
    );

-- Scanners can view tickets for events they are authorized to scan
CREATE POLICY "Scanners can view assigned event tickets"
    ON tickets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM event_scanners
            WHERE event_scanners.event_id = tickets.event_id
            AND event_scanners.user_id = auth.uid()
            AND event_scanners.is_active = true
        )
    );

-- SECURITY DEFINER functions (purchase_tickets, confirm_order_payment) bypass RLS.
-- These are the only functions allowed to INSERT/UPDATE tickets.

-- ─── ORDERS ──────────────────────────────────────────────────────────────────

-- Buyers can view their own orders
CREATE POLICY "Buyers can view their own orders"
    ON orders FOR SELECT
    USING (user_id = auth.uid());

-- Organizers can view orders for their events
CREATE POLICY "Organizers can view orders for their events"
    ON orders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = orders.event_id
            AND events.organizer_id = auth.uid()
        )
    );
