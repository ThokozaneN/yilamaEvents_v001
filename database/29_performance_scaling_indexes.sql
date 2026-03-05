/*
  # Yilama Events: Production Performance & Scaling Indexes
  
  This patch addresses severe schema scaling vulnerabilities.
  It introduces B-Tree indexing across all unindexed high-frequency Foreign Keys 
  and filtering columns (`status`, `organizer_id`, `user_id`, etc.).
  
  These indexes eliminate N+1 full-table-scans on the Organizer Dashboard, User Wallet,
  and Scanner endpoints, fortifying the CPU against scale degradation.
*/

-- -------------------------------------------------------------
-- 1. PROFILES & ROLES
-- -------------------------------------------------------------
-- Accelerate Role & Verification checks (RLS policies)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_organizer_status ON public.profiles(organizer_status);
CREATE INDEX IF NOT EXISTS idx_profiles_organizer_tier ON public.profiles(organizer_tier);


-- -------------------------------------------------------------
-- 2. EVENTS
-- -------------------------------------------------------------
-- Event Discovery & Dashboard lookups
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON public.events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON public.events(category);
-- Accelerating multi-tenant separation for dates
CREATE INDEX IF NOT EXISTS idx_event_dates_event_id ON public.event_dates(event_id);


-- -------------------------------------------------------------
-- 3. TICKETS & TYPES
-- -------------------------------------------------------------
-- Prevent full table scans on checkout page load
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON public.ticket_types(event_id);

-- Prevent Wallet / Scanning full table scans
-- Note: 'idx_tickets_public_id' and 'idx_tickets_event_id' were already created in patch_v42.
CREATE INDEX IF NOT EXISTS idx_tickets_owner_user_id ON public.tickets(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON public.tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);

-- Scanner history acceleration
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_ticket_id ON public.ticket_checkins(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_event_id ON public.ticket_checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_checkins_scanner_id ON public.ticket_checkins(scanner_id);


-- -------------------------------------------------------------
-- 4. ORDERS & PAYMENTS (Commerce)
-- -------------------------------------------------------------
-- High-frequency revenue dashboard & buyer history lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- Order Item aggregations (inventory ledger linking)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ticket_id ON public.order_items(ticket_id);

-- Payments / Gateway tracking
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);


-- -------------------------------------------------------------
-- 5. FINANCIAL ARCHITECTURE & SUBSCRIPTIONS
-- -------------------------------------------------------------
-- RLS heavily relies on finding an organizer's ledger
-- Note: 'idx_ledger_user_created' exists. Adding direct reference indexes.
CREATE INDEX IF NOT EXISTS idx_financial_transactions_reference_id ON public.financial_transactions(reference_id);

-- Wallet payout processing
CREATE INDEX IF NOT EXISTS idx_payouts_organizer_id ON public.payouts(organizer_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);

-- Subscription status tracking (Powers the new Revenue Integrity trigger)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);


-- -------------------------------------------------------------
-- 6. PERMISSIONS & RESALE
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_event_team_members_event_id ON public.event_team_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_members_user_id ON public.event_team_members(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON public.ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_sender_id ON public.ticket_transfers(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_recipient_id ON public.ticket_transfers(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_resale_listings_ticket_id ON public.resale_listings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_resale_listings_seller_id ON public.resale_listings(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_resale_listings_status ON public.resale_listings(status);
