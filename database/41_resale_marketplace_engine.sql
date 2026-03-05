/*
  # Yilama Events: Resale Marketplace Engine
  
  Updates the resale listings table with expiration, statuses, and
  adds an immutable trigger to ensure no listing exceeds 110% of the
  original face value and that organizers cannot scalp.
*/

-- 1. Ensure Resale Listings has proper status and expiry
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'resale_listings' AND column_name = 'expires_at') THEN
        ALTER TABLE resale_listings ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Trigger: Enforce 110% Markup Cap & Eligibility
CREATE OR REPLACE FUNCTION enforce_resale_markup_and_eligibility()
RETURNS TRIGGER AS $$
DECLARE
    v_original_price NUMERIC;
    v_event_id UUID;
    v_ticket_status TEXT;
    v_role TEXT;
    v_is_sold_out BOOLEAN;
BEGIN
    -- Only run on Insert or if price/status changes
    IF TG_OP = 'UPDATE' AND NEW.resale_price = OLD.resale_price AND NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Look up original price and ticket status
    SELECT price_at_purchase::NUMERIC, event_id INTO v_original_price, v_event_id 
    FROM order_items 
    WHERE ticket_id = NEW.ticket_id 
    LIMIT 1;

    -- If no order item found (comp ticket?), check ticket type price
    IF v_original_price IS NULL THEN
        SELECT tt.price INTO v_original_price
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE t.id = NEW.ticket_id;
    END IF;

    -- Ensure original price exists
    IF v_original_price IS NULL OR v_original_price = 0 THEN
        RAISE EXCEPTION 'Cannot resell a complimentary or zero-value ticket.';
    END IF;

    -- 110% Math Enforcement. Floor validation.
    NEW.original_price := v_original_price;
    IF NEW.resale_price > (v_original_price * 1.10) THEN
        RAISE EXCEPTION 'Resale price cannot exceed 110%% of the original face value (Max: R%)', (v_original_price * 1.10);
    END IF;

    -- Look up User Role
    SELECT role INTO v_role FROM profiles WHERE id = NEW.seller_user_id;
    IF v_role = 'organizer' THEN
        RAISE EXCEPTION 'Organizers cannot list tickets for resale. This violates anti-scalping policies.';
    END IF;
    
    -- Ensure ticket is valid
    SELECT status INTO v_ticket_status FROM tickets WHERE id = NEW.ticket_id;
    IF v_ticket_status != 'valid' THEN
         RAISE EXCEPTION 'Only valid, unused tickets can be listed for resale.';
    END IF;
    
    -- Enforce "Only sold out" - Optional depending on prompt, but safe to omit here 
    -- and put into the RPC so the trigger isn't overly heavy. 
    -- The RPC will handle the initial status switch.

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_resale_markup_and_eligibility ON resale_listings;
CREATE TRIGGER check_resale_markup_and_eligibility
    BEFORE INSERT OR UPDATE ON resale_listings
    FOR EACH ROW
    EXECUTE PROCEDURE enforce_resale_markup_and_eligibility();


-- 3. RPC: List Ticket for Resale
CREATE OR REPLACE FUNCTION list_ticket_for_resale(
    p_ticket_public_id UUID,
    p_resale_price NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_ticket_id UUID;
    v_event_id UUID;
    v_owner_user_id UUID;
    v_type_id UUID;
    v_is_sold_out BOOLEAN;
BEGIN
    -- 1. Validate Ownership and Status safely
    SELECT id, owner_user_id, event_id, ticket_type_id 
    INTO v_ticket_id, v_owner_user_id, v_event_id, v_type_id
    FROM tickets 
    WHERE public_id = p_ticket_public_id AND status = 'valid' AND owner_user_id = auth.uid()
    FOR UPDATE; -- Lock ticket row

    IF v_ticket_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ticket not found, not owned by you, or not valid.');
    END IF;

    -- 2. Ensure Event/Tier is Sold Out
    SELECT (quantity_sold >= quantity_limit) INTO v_is_sold_out 
    FROM ticket_types 
    WHERE id = v_type_id;

    IF NOT COALESCE(v_is_sold_out, false) THEN
        RETURN jsonb_build_object('success', false, 'message', 'This ticket tier is not yet sold out. Resale is restricted.');
    END IF;

    -- 3. Check for existing active listings
    IF EXISTS (SELECT 1 FROM resale_listings WHERE ticket_id = v_ticket_id AND status = 'active') THEN
         RETURN jsonb_build_object('success', false, 'message', 'Ticket is already listed.');
    END IF;

    -- 4. Create the Listing (Trigger will enforce markup)
    BEGIN
        INSERT INTO resale_listings (
            ticket_id, seller_user_id, original_price, resale_price, status
        ) VALUES (
            v_ticket_id, v_owner_user_id, 0, p_resale_price, 'active' -- original_price auto-filled by trigger
        );
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
    END;

    -- 5. Lock the Ticket
    UPDATE tickets SET status = 'listed', updated_at = now() WHERE id = v_ticket_id;

    RETURN jsonb_build_object('success', true, 'message', 'Ticket listed successfully on the marketplace.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC: Cancel Resale Listing
CREATE OR REPLACE FUNCTION cancel_ticket_resale(
    p_ticket_public_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_ticket_id UUID;
    v_listing_id UUID;
BEGIN
    SELECT id INTO v_ticket_id FROM tickets WHERE public_id = p_ticket_public_id AND owner_user_id = auth.uid() FOR UPDATE;
    
    IF v_ticket_id IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Unauthorized.');
    END IF;

    SELECT id INTO v_listing_id FROM resale_listings WHERE ticket_id = v_ticket_id AND status = 'active' AND seller_user_id = auth.uid() FOR UPDATE;
    
    IF v_listing_id IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'No active listing found.');
    END IF;

    -- Un-lock ticket
    UPDATE tickets SET status = 'valid', updated_at = now() WHERE id = v_ticket_id;
    
    -- Cancel Listing
    UPDATE resale_listings SET status = 'cancelled', updated_at = now() WHERE id = v_listing_id;

    RETURN jsonb_build_object('success', true, 'message', 'Listing cancelled. Ticket returned to wallet.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
