/*
  # Yilama Events: Purchase Tickets Seating Update
  
  Updates the `purchase_tickets` RPC to accept an array of selected seat IDs.
  When seats are provided, the RPC guarantees they are available, calculates
  the dynamic price dynamically per seat, and sets their status to 'reserved'.
*/

CREATE OR REPLACE FUNCTION purchase_tickets(
    p_event_id uuid,
    p_ticket_type_id uuid,
    p_quantity int,
    p_attendee_names text[],
    p_buyer_email text,
    p_buyer_name text,
    p_promo_code text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL, -- Explicit override for service-role callers
    p_seat_ids uuid[] DEFAULT NULL -- Optional list of seats mapped 1-to-1 with quantity
) RETURNS uuid AS $$
DECLARE
    v_order_id uuid;
    v_ticket_price numeric(10,2);
    v_total_amount numeric(10,2) := 0;
    v_organizer_id uuid;
    v_ticket_id uuid;
    v_owner_id uuid;
    v_current_price numeric(10,2);
    v_current_seat_id uuid;
    v_zone_multiplier numeric(5,2);
    v_pos_modifier numeric(5,2);
    i int;
BEGIN
    -- Resolve the owner: prefer explicit p_user_id, fall back to auth.uid()
    v_owner_id := COALESCE(p_user_id, auth.uid());

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Cannot create tickets: user identity is unknown (auth.uid() is NULL and no p_user_id provided).';
    END IF;

    IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) != p_quantity THEN
        RAISE EXCEPTION 'Quantity must match the number of selected seats.';
    END IF;

    -- 1. Get Base Ticket Price and Organizer
    SELECT price INTO v_ticket_price FROM ticket_types WHERE id = p_ticket_type_id AND event_id = p_event_id;
    IF NOT FOUND THEN
        v_ticket_price := 0;
    END IF;

    SELECT organizer_id INTO v_organizer_id FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found.';
    END IF;

    -- 2. Pre-calculate total amount to insert Order first
    FOR i IN 1..p_quantity LOOP
        v_current_price := v_ticket_price;
        IF p_seat_ids IS NOT NULL THEN
            SELECT vz.price_multiplier, vs.positional_modifier 
            INTO v_zone_multiplier, v_pos_modifier 
            FROM venue_seats vs 
            JOIN venue_zones vz ON vs.zone_id = vz.id 
            WHERE vs.id = p_seat_ids[i] AND vs.status = 'available';
            
            IF NOT FOUND THEN 
                RAISE EXCEPTION 'Seat % is not available or does not exist.', p_seat_ids[i]; 
            END IF;
            
            v_current_price := round((v_current_price * v_zone_multiplier * v_pos_modifier)::numeric, 2);
        END IF;
        v_total_amount := v_total_amount + v_current_price;
    END LOOP;

    -- 3. Create Order
    INSERT INTO orders (
        user_id,
        event_id,
        total_amount,
        currency,
        status,
        metadata
    ) VALUES (
        v_owner_id,
        p_event_id,
        v_total_amount,
        'ZAR',
        'pending',
        jsonb_build_object(
            'buyer_email', p_buyer_email,
            'buyer_name', p_buyer_name,
            'promo_code', p_promo_code
        )
    ) RETURNING id INTO v_order_id;

    -- 4. Create Tickets, Order Items, and Reserve Seats
    FOR i IN 1..p_quantity LOOP
        v_current_price := v_ticket_price;
        v_current_seat_id := NULL;
        
        IF p_seat_ids IS NOT NULL THEN
            v_current_seat_id := p_seat_ids[i];
            -- Re-fetch modifiers (we already verified availability above, but doing this locks in the exact price)
            SELECT vz.price_multiplier, vs.positional_modifier 
            INTO v_zone_multiplier, v_pos_modifier 
            FROM venue_seats vs 
            JOIN venue_zones vz ON vs.zone_id = vz.id 
            WHERE vs.id = v_current_seat_id;
            
            v_current_price := round((v_current_price * v_zone_multiplier * v_pos_modifier)::numeric, 2);
            
            -- Lock the Seat
            UPDATE venue_seats SET status = 'reserved' WHERE id = v_current_seat_id;
        END IF;

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
            v_owner_id,  -- Use resolved owner ID (not auth.uid())
            'valid',
            v_current_price,
            p_ticket_type_id,
            v_current_seat_id,
            jsonb_build_object('attendee_name', p_attendee_names[i])
        ) RETURNING id INTO v_ticket_id;

        INSERT INTO order_items (
            order_id,
            ticket_id,
            price_at_purchase
        ) VALUES (
            v_order_id,
            v_ticket_id,
            v_current_price
        );
    END LOOP;

    -- 5. Update Ticket Type sold count
    UPDATE ticket_types
    SET quantity_sold = quantity_sold + p_quantity,
        updated_at = NOW()
    WHERE id = p_ticket_type_id;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
