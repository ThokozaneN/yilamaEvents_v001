-- =============================================================================
-- 87_final_schema_sync.sql
--
-- FINAL SYNCHRONIZATION: This file ensures that projects using numbered 
-- migrations (01→86) are fully aligned with the seating and robust checkout
-- logic used by the Edge Functions.
-- =============================================================================


-- 1. Ensure Seating Enums exist
DO $$ BEGIN
    CREATE TYPE seat_status AS ENUM ('available', 'reserved', 'sold', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 2. Ensure Seating Columns exist in core tables
DO $$ 
BEGIN 
    -- Events Seating
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='is_seated') THEN
        ALTER TABLE public.events ADD COLUMN is_seated BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='layout_id') THEN
        ALTER TABLE public.events ADD COLUMN layout_id UUID;
    END IF;

    -- Tickets Seating
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='seat_id') THEN
        ALTER TABLE public.tickets ADD COLUMN seat_id UUID;
    END IF;

    -- Ticket Types Inventory Check (P-10 Resilience)
    -- Ensure quantity_reserved exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticket_types' AND column_name='quantity_reserved') THEN
        ALTER TABLE public.ticket_types ADD COLUMN quantity_reserved INTEGER DEFAULT 0;
    END IF;
END $$;


-- 3. Drop Ambiguous/Old purchase_tickets overloads
-- PostgREST cannot handle multiple functions with same name but different param types
-- when some params are JSON nulls.
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text, uuid);
DROP FUNCTION IF EXISTS public.purchase_tickets(uuid, uuid, integer, text[], text, text, text);


-- 4. Definitive purchase_tickets (v5 — Atomic Seating & User ID support)
CREATE OR REPLACE FUNCTION public.purchase_tickets(
    p_event_id uuid,
    p_ticket_type_id uuid,
    p_quantity int,
    p_attendee_names text[], 
    p_buyer_email text,
    p_buyer_name text,
    p_promo_code text DEFAULT NULL, 
    p_user_id uuid DEFAULT NULL,
    p_seat_ids uuid[] DEFAULT NULL
) RETURNS uuid AS $$
DECLARE 
    v_order_id uuid; 
    v_ticket_price numeric; 
    v_total_amount numeric := 0; 
    v_owner uuid; 
    v_avail int; 
    v_current_price numeric;
    v_current_seat_id uuid;
    v_zone_multiplier numeric;
    v_pos_modifier numeric;
    i int;
BEGIN
    -- Determine the owner: prefer p_user_id (from service role) or auth.uid()
    v_owner := COALESCE(p_user_id, auth.uid());
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Cannot create tickets: user identity unknown.';
    END IF;

    -- 1. Availability check with row lock
    SELECT price, (quantity_limit - quantity_sold - quantity_reserved) 
    INTO v_ticket_price, v_avail 
    FROM ticket_types WHERE id = p_ticket_type_id FOR UPDATE;
    
    IF v_avail < p_quantity THEN 
        RAISE EXCEPTION 'This ticket tier is sold out or has insufficient tickets.'; 
    END IF;

    -- 2. Calculate dynamic price if seating is involved
    FOR i IN 1..p_quantity LOOP
        v_current_price := v_ticket_price;
        IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) >= i THEN
            SELECT vz.price_multiplier, vs.positional_modifier 
            INTO v_zone_multiplier, v_pos_modifier 
            FROM venue_seats vs JOIN venue_zones vz ON vs.zone_id = vz.id 
            WHERE vs.id = p_seat_ids[i] AND vs.status = 'available';
            
            IF NOT FOUND THEN 
                RAISE EXCEPTION 'Seat % is no longer available.', p_seat_ids[i]; 
            END IF;
            v_current_price := round((v_current_price * v_zone_multiplier * v_pos_modifier)::numeric, 2);
        END IF;
        v_total_amount := v_total_amount + v_current_price;
    END LOOP;

    -- 3. Create the parent Order
    INSERT INTO orders (
        user_id, 
        event_id, 
        total_amount, 
        status, 
        metadata
    ) VALUES (
        v_owner, 
        p_event_id, 
        v_total_amount, 
        'pending', 
        jsonb_build_object('buyer_email', p_buyer_email, 'buyer_name', p_buyer_name, 'promo_code', p_promo_code)
    ) RETURNING id INTO v_order_id;

    -- 4. Generate individual Tickets and Order Items
    FOR i IN 1..p_quantity LOOP
        v_current_price := v_ticket_price;
        v_current_seat_id := NULL;
        
        -- Handle Seating attachment
        IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) >= i THEN
            v_current_seat_id := p_seat_ids[i];
            -- Lock the seat immediately
            UPDATE venue_seats SET status = 'reserved' WHERE id = v_current_seat_id;
            
            -- Recalculate price for order item parity
            SELECT vz.price_multiplier, vs.positional_modifier 
            INTO v_zone_multiplier, v_pos_modifier 
            FROM venue_seats vs JOIN venue_zones vz ON vs.zone_id = vz.id 
            WHERE vs.id = v_current_seat_id;
            v_current_price := round((v_current_price * v_zone_multiplier * v_pos_modifier)::numeric, 2);
        END IF;

        -- Create Ticket (in 'reserved' status until paid)
        INSERT INTO tickets (
            event_id, 
            owner_user_id, 
            status, 
            price, 
            ticket_type_id, 
            seat_id, 
            metadata
        ) VALUES (
            p_event_id, 
            v_owner, 
            'reserved', 
            v_current_price, 
            p_ticket_type_id, 
            v_current_seat_id, 
            jsonb_build_object('attendee_name', p_attendee_names[i])
        ) RETURNING id INTO v_current_seat_id; -- reuse variable name for ticket_id

        -- Create link to Order
        INSERT INTO order_items (order_id, ticket_id, price_at_purchase) 
        VALUES (v_order_id, v_current_seat_id, v_current_price);
    END LOOP;

    -- 5. Finalize inventory reservation
    UPDATE ticket_types 
    SET quantity_reserved = quantity_reserved + p_quantity,
        updated_at = NOW()
    WHERE id = p_ticket_type_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. Fix Unified Discovery (Alignment Check)
-- Ensures the RPC includes all client-expected fields (like is_seated).
CREATE OR REPLACE FUNCTION get_discovery_events(p_user_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    v_personalized_events jsonb;
    v_trending_events jsonb;
    v_now timestamptz := now();
BEGIN
    WITH raw_p AS (SELECT id FROM get_personalized_events(p_user_id) LIMIT 50)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', e.id, 'title', e.title, 'description', e.description, 'venue', e.venue, 'image_url', e.image_url, 'category', e.category, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status, 
            'is_seated', COALESCE(e.is_seated, false), 
            'created_at', e.created_at, 'organizer_id', e.organizer_id,
            'tiers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'quantity_limit', tt.quantity_limit, 'quantity_sold', tt.quantity_sold)), '[]'::jsonb) FROM ticket_types tt WHERE tt.event_id = e.id),
            'organizer', jsonb_build_object('business_name', p.business_name, 'organizer_status', p.organizer_status, 'organizer_tier', p.organizer_tier, 'instagram_handle', p.instagram_handle, 'twitter_handle', p.twitter_handle, 'facebook_handle', p.facebook_handle, 'website_url', p.website_url)
        )), '[]'::jsonb) INTO v_personalized_events
    FROM raw_p rp JOIN events e ON e.id = rp.id LEFT JOIN profiles p ON p.id = e.organizer_id;

    WITH raw_t AS (SELECT id FROM get_trending_events() LIMIT 10)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', e.id, 'title', e.title, 'description', e.description, 'venue', e.venue, 'image_url', e.image_url, 'category', e.category, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'status', e.status, 
            'is_seated', COALESCE(e.is_seated, false), 
            'created_at', e.created_at, 'organizer_id', e.organizer_id,
            'tiers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', tt.id, 'name', tt.name, 'price', tt.price, 'quantity_limit', tt.quantity_limit, 'quantity_sold', tt.quantity_sold)), '[]'::jsonb) FROM ticket_types tt WHERE tt.event_id = e.id),
            'organizer', jsonb_build_object('business_name', p.business_name, 'organizer_status', p.organizer_status, 'organizer_tier', p.organizer_tier, 'instagram_handle', p.instagram_handle, 'twitter_handle', p.twitter_handle, 'facebook_handle', p.facebook_handle, 'website_url', p.website_url)
        )), '[]'::jsonb) INTO v_trending_events
    FROM raw_t rt JOIN events e ON e.id = rt.id LEFT JOIN profiles p ON p.id = e.organizer_id;

    RETURN jsonb_build_object('personalized', v_personalized_events, 'trending', v_trending_events);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. GRANT EXECUTE (Consistency)
GRANT EXECUTE ON FUNCTION get_discovery_events(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_events(uuid) TO anon;
