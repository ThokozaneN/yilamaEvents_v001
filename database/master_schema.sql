-- =============================================================================
-- YILAMA EVENTS MASTER SCHEMA v5 | 2026-03-05
-- =============================================================================
-- This is THE definitive, single-file database schema for Yilama Events.
-- It consolidates every migration from 01 to 81 and all subsequent patches.
-- =============================================================================

-- ─── PART 1: FOUNDATIONS ───────────────────────────────────────────────────

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('attendee', 'organizer', 'admin', 'scanner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE organizer_status AS ENUM ('draft', 'pending', 'verified', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('reserved', 'valid', 'used', 'refunded', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── PART 2: IDENTITY & SUBSCRIPTIONS ───────────────────────────────────────

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email text UNIQUE,
    name text,
    role user_role DEFAULT 'attendee',
    
    -- Organizer Specifics
    organizer_status organizer_status DEFAULT 'draft',
    business_name text,
    phone text,
    avatar_url text,
    website_url text,
    instagram_handle text,
    twitter_handle text,
    facebook_handle text,
    
    -- Verification Documents
    organization_phone text,
    id_number text,
    id_proof_url text,
    organization_proof_url text,
    address_proof_url text,
    
    -- Banking
    bank_name text,
    branch_code text,
    account_number text,
    account_holder text,
    account_type text,
    
    -- Status & Scoring
    organizer_tier text DEFAULT 'free', 
    organizer_trust_score int DEFAULT 0,
    
    metadata jsonb DEFAULT '{}'::jsonb,
    
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- COMPOSITE PROFILES (Unified view for auth status)
CREATE OR REPLACE VIEW public.v_composite_profiles
WITH (security_invoker = false) -- SECURITY DEFINER: runs as view owner (postgres)
AS
SELECT
    p.*,
    u.email_confirmed_at IS NOT NULL AS email_verified
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id;

REVOKE SELECT ON public.v_composite_profiles FROM anon;
GRANT SELECT ON public.v_composite_profiles TO authenticated;

-- PLANS (Tier definition)
CREATE TABLE IF NOT EXISTS public.plans (
    id text PRIMARY KEY, -- 'free', 'pro', 'premium'
    name text NOT NULL,
    price numeric(10,2) NOT NULL CHECK (price >= 0),
    currency text DEFAULT 'ZAR',
    
    events_limit int NOT NULL DEFAULT 999999,
    tickets_limit int NOT NULL DEFAULT 999999,
    ticket_types_limit int NOT NULL DEFAULT 1,
    scanners_limit int NOT NULL DEFAULT 1,
    commission_rate numeric(4,3) NOT NULL DEFAULT 0.020,
    
    ai_features boolean DEFAULT false,
    seating_map boolean DEFAULT false,
    features jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT NOW()
);

-- Ensure all columns exist for existing databases (Idempotency)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ticket_types_limit') THEN
        ALTER TABLE public.plans ADD COLUMN ticket_types_limit int NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ai_features') THEN
        ALTER TABLE public.plans ADD COLUMN ai_features boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'seating_map') THEN
        ALTER TABLE public.plans ADD COLUMN seating_map boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    plan_id text REFERENCES plans(id) NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'pending_verification')),
    current_period_start timestamptz NOT NULL,
    current_period_end timestamptz NOT NULL,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- ─── PART 3: EVENTS & TICKETING ─────────────────────────────────────────────

-- EVENT CATEGORIES
CREATE TABLE IF NOT EXISTS public.event_categories (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text UNIQUE NOT NULL,
    slug text UNIQUE NOT NULL,
    icon_name text,
    display_order int DEFAULT 0,
    created_at timestamptz DEFAULT NOW()
);

-- EVENTS
CREATE TABLE IF NOT EXISTS public.events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    category_id uuid REFERENCES public.event_categories(id),
    
    title text NOT NULL,
    description text,
    venue text,
    address_text text,
    latitude numeric(10, 8),
    longitude numeric(11, 8),
    
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    
    image_url text,
    poster_url text,
    status text DEFAULT 'draft', -- draft, published, coming_soon, ended, cancelled
    is_private boolean DEFAULT false,
    max_capacity int DEFAULT 0,
    total_ticket_limit int DEFAULT 0,
    fee_preference text DEFAULT 'post_event' CHECK (fee_preference IN ('upfront', 'post_event')),
    
    -- Rich Fields
    cooler_box_price numeric(10,2) DEFAULT 0,
    headliners text[],
    prohibitions text[],
    parking_info text,
    
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- TICKET TYPES
CREATE TABLE IF NOT EXISTS public.ticket_types (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL DEFAULT 0.00,
    quantity_total int NOT NULL DEFAULT 0,
    quantity_sold int NOT NULL DEFAULT 0,
    quantity_reserved int NOT NULL DEFAULT 0,
    sale_start timestamptz,
    sale_end timestamptz,
    access_rules jsonb DEFAULT '{}'::jsonb,
    
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW(),
    CONSTRAINT inventory_cap CHECK (quantity_sold + quantity_reserved <= quantity_total)
);

-- TICKETS
CREATE TABLE IF NOT EXISTS public.tickets (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    public_id uuid DEFAULT uuid_generate_v4() UNIQUE,
    event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
    
    status ticket_status DEFAULT 'reserved',
    price numeric(10,2) DEFAULT 0.00,
    secret_key text, -- TOTP / HMAC
    metadata jsonb DEFAULT '{}'::jsonb,
    
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- TICKET CHECK-INS
CREATE TABLE IF NOT EXISTS public.ticket_checkins (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
    scanner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    scanned_at timestamptz DEFAULT NOW(),
    result text NOT NULL CHECK (result IN ('success', 'duplicate', 'invalid_event', 'invalid_signature', 'invalid_status')),
    scan_zone text DEFAULT 'general',
    device_id text,
    location jsonb,
    created_at timestamptz DEFAULT NOW()
);

-- ─── PART 4: COMMERCE & FINANCE ─────────────────────────────────────────────

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_id uuid REFERENCES public.events(id) ON DELETE RESTRICT NOT NULL,
    total_amount numeric(10,2) NOT NULL CHECK (total_amount >= 0),
    currency text DEFAULT 'ZAR',
    status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired')),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    ticket_id uuid REFERENCES public.tickets(id) ON DELETE RESTRICT,
    price_at_purchase numeric(10,2) NOT NULL CHECK (price_at_purchase >= 0),
    created_at timestamptz DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT NOT NULL,
    provider text NOT NULL, -- 'payfast', 'stripe'
    provider_tx_id text NOT NULL,
    amount numeric(10,2) NOT NULL CHECK (amount >= 0),
    currency text DEFAULT 'ZAR',
    status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    provider_metadata jsonb,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW(),
    UNIQUE(provider, provider_tx_id)
);

-- LEDGER
CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_user_id uuid REFERENCES public.profiles(id) NOT NULL,
    type text NOT NULL CHECK (type IN ('credit', 'debit')),
    amount numeric(10,2) NOT NULL CHECK (amount > 0),
    category text NOT NULL CHECK (category IN ('ticket_sale', 'platform_fee', 'payout', 'refund', 'subscription_charge', 'adjustment')),
    reference_type text NOT NULL, -- 'order', 'payout', 'subscription'
    reference_id text NOT NULL,
    description text,
    balance_after numeric(10,2), 
    created_at timestamptz DEFAULT NOW()
);

-- PAYOUTS
CREATE TABLE IF NOT EXISTS public.payouts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id uuid REFERENCES public.profiles(id) NOT NULL,
    amount numeric(10,2) NOT NULL CHECK (amount > 0),
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    bank_reference text,
    expected_payout_date timestamptz NOT NULL,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- ─── PART 5: SEATING & ADVANCED FEATURES ────────────────────────────────────

-- SEATING
CREATE TABLE IF NOT EXISTS public.venue_layouts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text DEFAULT 'stadium',
    svg_width int DEFAULT 1000,
    svg_height int DEFAULT 800,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.venue_zones (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    layout_id uuid REFERENCES public.venue_layouts(id) ON DELETE CASCADE,
    ticket_type_id uuid REFERENCES public.ticket_types(id) ON DELETE SET NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6',
    price_multiplier numeric(4,3) DEFAULT 1.000,
    path_data text,
    created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.venue_seats (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    layout_id uuid REFERENCES public.venue_layouts(id) ON DELETE CASCADE,
    zone_id uuid REFERENCES public.venue_zones(id) ON DELETE SET NULL,
    label text NOT NULL,
    x int NOT NULL,
    y int NOT NULL,
    status text DEFAULT 'available', -- available, reserved, sold, blocked
    created_at timestamptz DEFAULT NOW()
);

-- EXPERIENCES
CREATE TABLE IF NOT EXISTS public.experiences (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organizer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    image_url text,
    location jsonb DEFAULT '{}'::jsonb,
    duration_minutes int,
    status text DEFAULT 'draft',
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.experience_sessions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    experience_id uuid REFERENCES public.experiences(id) ON DELETE CASCADE NOT NULL,
    starts_at timestamptz NOT NULL,
    capacity int NOT NULL,
    quantity_booked int DEFAULT 0,
    price numeric(10,2) NOT NULL,
    created_at timestamptz DEFAULT NOW()
);

-- WAITLISTS & NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.event_waitlists (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    email text NOT NULL,
    name text,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT NOW(),
    UNIQUE(event_id, email)
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    type text NOT NULL,
    is_read boolean DEFAULT false,
    link text,
    created_at timestamptz DEFAULT NOW()
);

-- ─── PART 6: SYSTEM, AUDIT & STORAGE ────────────────────────────────────────

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    created_at timestamptz DEFAULT NOW()
);

-- STORAGE BUCKETS (Provisions standard Supabase storage)
INSERT INTO storage.buckets (id, name, public) VALUES 
('event-posters', 'event-posters', true),
('event-images', 'event-images', true),
('profile-avatars', 'profile-avatars', true),
('verification-docs', 'verification-docs', false),
('ticket-assets', 'ticket-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ─── PART 7: SECURITY & HELPERS ───────────────────────────────────────────

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$ BEGIN RETURN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'); END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- get_organizer_fee_percentage
CREATE OR REPLACE FUNCTION public.get_organizer_fee_percentage(p_organizer_id uuid)
RETURNS numeric AS $$
DECLARE v_commission numeric;
BEGIN
    SELECT p.commission_rate INTO v_commission FROM subscriptions s JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = p_organizer_id AND s.status = 'active' AND s.current_period_end > now() LIMIT 1;
    RETURN COALESCE(v_commission, 0.020);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role, name, organizer_tier)
    VALUES (new.id, new.email, COALESCE((new.raw_user_meta_data->>'role')::user_role, 'attendee'), 
            COALESCE(new.raw_user_meta_data->>'full_name', new.email), 'free');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── PART 8: ROW LEVEL SECURITY (RLS) ───────────────────────────────────────

DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;
END; $$;

-- Profiles
CREATE POLICY "Public profiles are viewable" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Events & Tickets
CREATE POLICY "Public view events" ON events FOR SELECT USING (status = 'published' AND is_private = false);
CREATE POLICY "Organizers manage events" ON events FOR ALL USING (organizer_id = auth.uid());
CREATE POLICY "Owners view tickets" ON tickets FOR SELECT USING (owner_user_id = auth.uid());
CREATE POLICY "Organizers view tickets" ON tickets FOR SELECT USING (EXISTS (SELECT 1 FROM events WHERE id = event_id AND organizer_id = auth.uid()));

-- Storage
CREATE POLICY "Public read posters" ON storage.objects FOR SELECT USING (bucket_id IN ('event-posters', 'event-images', 'profile-avatars'));
CREATE POLICY "Users manage own storage" ON storage.objects FOR ALL USING (auth.role() = 'authenticated' AND (bucket_id IN ('event-posters', 'event-images', 'profile-avatars') OR owner = auth.uid()));

-- ─── PART 9: CORE BUSINESS RPCs ────────────────────────────────────────────

-- purchase_tickets (v3 Security Hardened)
CREATE OR REPLACE FUNCTION public.purchase_tickets(
    p_event_id uuid, p_ticket_type_id uuid, p_quantity int, p_attendee_names text[], 
    p_buyer_email text, p_buyer_name text, p_promo_code text DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL, p_seat_ids uuid[] DEFAULT NULL
) RETURNS uuid AS $$
DECLARE v_order_id uuid; v_price numeric; v_total numeric; v_owner uuid; v_avail int; i int;
BEGIN
    v_owner := COALESCE(p_user_id, auth.uid());
    SELECT price, (quantity_total - quantity_sold - quantity_reserved) INTO v_price, v_avail FROM ticket_types WHERE id = p_ticket_type_id FOR UPDATE;
    IF v_avail < p_quantity THEN RAISE EXCEPTION 'Sold out'; END IF;
    v_total := v_price * p_quantity;
    INSERT INTO orders (user_id, event_id, total_amount, status, metadata) VALUES (v_owner, p_event_id, v_total, 'pending', jsonb_build_object('buyer_email', p_buyer_email)) RETURNING id INTO v_order_id;
    FOR i IN 1..p_quantity LOOP
        INSERT INTO tickets (event_id, owner_user_id, status, price, ticket_type_id, metadata) VALUES (p_event_id, v_owner, 'reserved', v_price, p_ticket_type_id, jsonb_build_object('attendee_name', p_attendee_names[i]));
        INSERT INTO order_items (order_id, ticket_id, price_at_purchase) VALUES (v_order_id, (SELECT id FROM tickets WHERE event_id = p_event_id ORDER BY created_at DESC LIMIT 1), v_price);
    END LOOP;
    UPDATE ticket_types SET quantity_reserved = quantity_reserved + p_quantity WHERE id = p_ticket_type_id;
    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- confirm_order_payment
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id text, p_payment_ref text, p_provider text) RETURNS void AS $$
DECLARE v_uuid uuid; v_order orders%ROWTYPE; tt_id uuid; tt_count int;
BEGIN
    v_uuid := p_order_id::uuid;
    SELECT * INTO v_order FROM orders WHERE id = v_uuid;
    IF NOT FOUND OR v_order.status = 'paid' THEN RETURN; END IF;
    UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = v_uuid;
    INSERT INTO payments (order_id, provider, provider_tx_id, amount, status) VALUES (v_uuid, p_provider, p_payment_ref, v_order.total_amount, 'completed');
    UPDATE tickets SET status = 'valid' WHERE id IN (SELECT ticket_id FROM order_items WHERE order_id = v_uuid) AND status = 'reserved';
    FOR tt_id, tt_count IN SELECT tt.ticket_type_id, COUNT(*) FROM order_items oi JOIN tickets tt ON oi.ticket_id = tt.id WHERE oi.order_id = v_uuid GROUP BY tt.ticket_type_id
    LOOP UPDATE ticket_types SET quantity_sold = quantity_sold + tt_count, quantity_reserved = GREATEST(0, quantity_reserved - tt_count) WHERE id = tt_id; END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- validate_ticket_scan (v5 — Timewindow & Signature Support)
CREATE OR REPLACE FUNCTION public.validate_ticket_scan(
    p_ticket_public_id UUID,
    p_event_id UUID,
    p_scanner_id UUID,
    p_zone TEXT DEFAULT 'general',
    p_signature TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket_data RECORD;
    v_event_start TIMESTAMPTZ;
    v_event_end TIMESTAMPTZ;
    v_scan_start TIMESTAMPTZ;
    v_scan_end TIMESTAMPTZ;
    v_success_scans INT;
BEGIN
    -- 0. Get Event Time Window
    SELECT starts_at, ends_at INTO v_event_start, v_event_end
    FROM events WHERE id = p_event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Event not found', 'code', 'NOT_FOUND');
    END IF;

    -- The window: 2 hours before start, until the end (or +6 hours if no end set)
    v_scan_start := v_event_start - INTERVAL '2 hours';
    v_scan_end := COALESCE(v_event_end, v_event_start + INTERVAL '6 hours');

    IF now() < v_scan_start THEN
        RETURN jsonb_build_object('success', false, 'message', 'Event has not started (scanning opens 2 hours before)', 'code', 'TOO_EARLY');
    END IF;

    IF now() > v_scan_end THEN
        RETURN jsonb_build_object('success', false, 'message', 'Event has ended', 'code', 'TOO_LATE');
    END IF;

    -- 1. Lookup Ticket
    SELECT t.id, t.status, t.event_id, tt.name AS tier_name, p.name AS owner_name
    FROM tickets t
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    LEFT JOIN profiles p ON t.owner_user_id = p.id
    WHERE t.public_id = p_ticket_public_id INTO v_ticket_data;

    IF v_ticket_data.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ticket not found', 'code', 'NOT_FOUND');
    END IF;

    IF v_ticket_data.event_id != p_event_id THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'invalid_event');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    END IF;
    
    IF v_ticket_data.status != 'valid' THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'invalid_status');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    END IF;

    -- 2. Duplicate Check
    SELECT count(*) INTO v_success_scans FROM ticket_checkins 
    WHERE ticket_id = v_ticket_data.id AND result = 'success';

    IF v_success_scans >= 1 THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'duplicate');
        RETURN jsonb_build_object('success', false, 'message', 'Already used', 'code', 'DUPLICATE');
    END IF;

    -- 3. Success!
    INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
    VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'success');

    UPDATE tickets SET status = 'used', updated_at = now() WHERE id = v_ticket_data.id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Valid Admission', 
        'code', 'SUCCESS', 
        'ticket', jsonb_build_object('tier', v_ticket_data.tier_name, 'owner', v_ticket_data.owner_name)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── PART 10: ANALYTICS & LEDGER TRIGGERS ──────────────────────────────────

-- ledger_on_order_paid
CREATE OR REPLACE FUNCTION ledger_on_order_paid() RETURNS trigger AS $$
DECLARE v_org uuid; v_fee_rate numeric; v_fee_amt numeric;
BEGIN
    IF NEW.status != 'paid' OR OLD.status = 'paid' THEN RETURN NEW; END IF;
    SELECT organizer_id INTO v_org FROM events WHERE id = NEW.event_id;
    -- Idempotency check with explicit cast (Hotfix 84)
    IF NOT EXISTS(SELECT 1 FROM financial_transactions WHERE reference_id::text = NEW.id::text AND category = 'ticket_sale') THEN
        INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
        VALUES (v_org, 'credit', NEW.total_amount, 'ticket_sale', 'order', NEW.id, 'Sale ' || NEW.id);
        v_fee_rate := get_organizer_fee_percentage(v_org);
        v_fee_amt := ROUND(NEW.total_amount * v_fee_rate, 2);
        IF v_fee_amt > 0 THEN
            INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
            VALUES (v_org, 'debit', v_fee_amt, 'platform_fee', 'order', NEW.id, 'Fee ' || NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_ledger_on_paid AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION ledger_on_order_paid();

-- TICKET NOTIFICATIONS
CREATE OR REPLACE FUNCTION notify_on_ticket_purchase()
RETURNS TRIGGER AS $$
DECLARE v_event_title TEXT;
BEGIN
    IF NEW.status = 'valid' AND (TG_OP = 'INSERT' OR OLD.status != 'valid') THEN
        SELECT title INTO v_event_title FROM public.events WHERE id = NEW.event_id;
        INSERT INTO public.app_notifications (user_id, title, body, type, action_url)
        VALUES (NEW.owner_user_id, 'Ticket Confirmed 🎟️', 'You successfully purchased a ticket for ' || coalesce(v_event_title, 'an event') || '. Check your wallet!', 'ticket_purchase', '/wallet');
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_notify_ticket_purchase AFTER INSERT OR UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION notify_on_ticket_purchase();

-- TICKET EMAIL WEBHOOK
CREATE OR REPLACE FUNCTION execute_ticket_email_webhook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_payload jsonb; v_url text; v_webhook_secret text;
BEGIN
  v_url := COALESCE(current_setting('app.settings.supabase_url', true), 'https://bvjcvdnfoqmxzdflqsdp.supabase.co') || '/functions/v1/send-ticket-email';
  v_payload := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA, 'record', row_to_json(NEW), 'old_record', row_to_json(OLD));
  BEGIN
    SELECT decrypted_secret INTO v_webhook_secret FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_webhook_secret := NULL; END;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', COALESCE(v_webhook_secret, '')), body := v_payload);
  RETURN NEW;
END; $$;

CREATE TRIGGER tr_send_ticket_email AFTER UPDATE OF status ON orders FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status != 'paid') EXECUTE FUNCTION execute_ticket_email_webhook();

-- ─── PART 11: SEED DATA ────────────────────────────────────────────────────

INSERT INTO plans (id, name, price, events_limit, tickets_limit, ticket_types_limit, scanners_limit, commission_rate, ai_features, seating_map) VALUES 
('free', 'Starter', 0, 999999, 999999, 1, 1, 0.020, false, false),
('pro', 'Professional', 199.00, 999999, 999999, 10, 5, 0.020, true, true),
('premium', 'Premium', 399.00, 999999, 999999, 999999, 999999, 0.015, true, true)
ON CONFLICT (id) DO UPDATE SET commission_rate = EXCLUDED.commission_rate, ticket_types_limit = EXCLUDED.ticket_types_limit;

INSERT INTO event_categories (name, slug, icon_name, display_order) VALUES
('Music', 'music', 'Music', 1), ('Arts', 'arts', 'Palette', 2), ('Food', 'food', 'Utensils', 3), ('Other', 'other', 'Calendar', 99)
ON CONFLICT (slug) DO NOTHING;

-- Safety search_path
ALTER DATABASE postgres SET search_path TO public, auth, extensions, storage;
