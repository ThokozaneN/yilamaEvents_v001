/*
  # Yilama Events: Engagement & Notification Triggers
  
  Provides database triggers to automatically populate the 
  `notifications` table for key events (Resale Listings, Sell Outs).
*/

-- 1. Sold-Out Event Notification
CREATE OR REPLACE FUNCTION notify_organizer_sold_out()
RETURNS TRIGGER AS $$
DECLARE
    v_event_id UUID;
    v_organizer_id UUID;
    v_event_title TEXT;
BEGIN
    -- Check if it just sold out (quantity_sold reached quantity_limit)
    IF NEW.quantity_sold >= NEW.quantity_limit AND OLD.quantity_sold < OLD.quantity_limit THEN
        
        -- Get Event Details
        SELECT id, organizer_id, title INTO v_event_id, v_organizer_id, v_event_title
        FROM events WHERE id = NEW.event_id;

        -- Insert Notification
        INSERT INTO notifications (
            user_id, title, message, type, "actionUrl"
        ) VALUES (
            v_organizer_id,
            '🚨 Tier Sold Out!',
            'Your ticket tier "' || NEW.name || '" for "' || v_event_title || '" has officially sold fully out. Congrats!',
            'system',
            '/' -- Or relevant deep link to dashboard
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_sold_out ON ticket_types;
CREATE TRIGGER trigger_notify_sold_out
    AFTER UPDATE OF quantity_sold ON ticket_types
    FOR EACH ROW
    EXECUTE PROCEDURE notify_organizer_sold_out();


-- 2. Resale Listing Availability Alert
-- Notifies all past attendees of this organizer that a new resale ticket dropped.
-- Limits to max 100 recent active users to prevent massive spikes without queueing.
CREATE OR REPLACE FUNCTION notify_resale_listings_available()
RETURNS TRIGGER AS $$
DECLARE
    v_event_title TEXT;
    v_organizer_id UUID;
    v_user_id UUID;
BEGIN
    -- Only trigger when a NEW listing becomes 'active'
    IF (TG_OP = 'INSERT' AND NEW.status = 'active') OR (TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status != 'active') THEN
        
        SELECT e.title, e.organizer_id INTO v_event_title, v_organizer_id
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = NEW.ticket_id;

        -- Insert notification for users who follow or have bought from this organizer before
        -- EXCLUDING the seller
        FOR v_user_id IN 
            SELECT DISTINCT t.owner_user_id 
            FROM tickets t
            JOIN events e ON t.event_id = e.id
            WHERE e.organizer_id = v_organizer_id AND t.owner_user_id != NEW.seller_user_id
            LIMIT 50 -- Scalability cap for synchronous trigger
        LOOP
            INSERT INTO notifications (
                user_id, title, message, type, "actionUrl"
            ) VALUES (
                v_user_id,
                '🎟️ Resale Ticket Available',
                'A new resale ticket has been listed for "' || v_event_title || '" by an organizer you frequent.',
                'marketing',
                '/resale'
            );
        END LOOP;
        
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_resale ON resale_listings;
CREATE TRIGGER trigger_notify_resale
    AFTER INSERT OR UPDATE ON resale_listings
    FOR EACH ROW
    EXECUTE PROCEDURE notify_resale_listings_available();
