-- =============================================================================
-- 86_fix_app_notifications_trigger.sql
--
-- Resolves the bug where users didn't receive an in-app notification when 
-- successfully purchasing a ticket.
--
-- Root Cause: The original trigger fired ON INSERT checking for status = 'valid'.
-- However, tickets are inserted as 'reserved' and later UPDATED to 'valid'
-- when the PayFast ITN completes. The notification trigger never fired.
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_on_ticket_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_event_title TEXT;
BEGIN
    -- Only trigger when a ticket transitions to 'valid'
    IF NEW.status = 'valid' AND (TG_OP = 'INSERT' OR OLD.status != 'valid') THEN
        -- Get event title
        SELECT title INTO v_event_title FROM public.events WHERE id = NEW.event_id;
        
        INSERT INTO public.app_notifications (user_id, title, body, type, action_url)
        VALUES (
            NEW.owner_user_id,
            'Ticket Confirmed 🎟️',
            'You successfully purchased a ticket for ' || coalesce(v_event_title, 'an event') || '. Check your wallet!',
            'ticket_purchase',
            '/wallet'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_notify_ticket_purchase ON public.tickets;
CREATE TRIGGER trigger_notify_ticket_purchase
    AFTER INSERT OR UPDATE OF status ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_ticket_purchase();
