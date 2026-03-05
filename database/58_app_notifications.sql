-- 58_app_notifications.sql
-- Creates the app_notifications table and automated triggers for system alerts.

-- 1. Create the notifications table
CREATE TABLE IF NOT EXISTS public.app_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('system', 'event_update', 'ticket_purchase', 'fraud_alert', 'premium_launch')),
    action_url TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes for faster querying of unread status
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_id_unread ON public.app_notifications(user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at ON public.app_notifications(created_at DESC);

-- 3. Row Level Security
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
    ON public.app_notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications (mark as read)"
    ON public.app_notifications FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Only system/triggers can insert/delete (enforced by default deny on INSERT/DELETE for anon/authenticated)

-- 4. RPCs for the frontend
CREATE OR REPLACE FUNCTION get_unread_count() 
RETURNS INTEGER AS $$
DECLARE
    count_val INTEGER;
BEGIN
    SELECT count(*) INTO count_val
    FROM public.app_notifications
    WHERE user_id = auth.uid() AND is_read = false;
    
    RETURN count_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION mark_all_notifications_read() 
RETURNS void AS $$
BEGIN
    UPDATE public.app_notifications
    SET is_read = true
    WHERE user_id = auth.uid() AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Automated Triggers

-- A. Trigger for Ticket Purchases
CREATE OR REPLACE FUNCTION notify_on_ticket_purchase()
RETURNS TRIGGER AS $$
DECLARE
    v_event_title TEXT;
BEGIN
    -- Only trigger on successful purchase inserts if valid
    IF NEW.status = 'valid' THEN
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

DROP TRIGGER IF EXISTS trigger_notify_ticket_purchase ON public.tickets;
CREATE TRIGGER trigger_notify_ticket_purchase
    AFTER INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_ticket_purchase();


-- B. Trigger for Premium Event Launches & Cancellations
CREATE OR REPLACE FUNCTION notify_on_event_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_organizer_tier TEXT;
    v_organizer_name TEXT;
    v_ticket_buyer RECORD;
    v_user RECORD;
BEGIN
    -- Only act if status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        
        -- Case 1: Premium Organizer publishes a new event
        IF NEW.status = 'published' AND OLD.status IN ('draft', 'coming_soon') THEN
            -- Check if organizer is Premium
            SELECT organizer_tier, business_name INTO v_organizer_tier, v_organizer_name 
            FROM public.profiles 
            WHERE id = NEW.organizer_id;
            
            IF v_organizer_tier = 'premium' THEN
                -- Broadcast to ALL users (V1 strategy)
                -- Note: In a massive DB this could be slow, but for V1 it meets requirements.
                FOR v_user IN SELECT id FROM public.profiles WHERE role = 'user' LOOP
                    INSERT INTO public.app_notifications (user_id, title, body, type, action_url)
                    VALUES (
                        v_user.id,
                        'New Premium Event! 🎉',
                        coalesce(v_organizer_name, 'A top organizer') || ' just launched: ' || NEW.title || '. Grab your tickets now!',
                        'premium_launch',
                        '/events/' || NEW.id
                    );
                END LOOP;
            END IF;
        END IF;

        -- Case 2: Event Cancellation
        IF NEW.status = 'cancelled' THEN
            -- Notify everyone who holds a valid ticket
            FOR v_ticket_buyer IN (
                SELECT DISTINCT owner_user_id 
                FROM public.tickets 
                WHERE event_id = NEW.id AND status = 'valid'
            ) LOOP
                INSERT INTO public.app_notifications (user_id, title, body, type, action_url)
                VALUES (
                    v_ticket_buyer.owner_user_id,
                    'Event Cancelled 🛑',
                    'Unfortunately, ' || NEW.title || ' has been cancelled. Please check your email for refund details.',
                    'event_update',
                    '/wallet'
                );
            END LOOP;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_event_status_change ON public.events;
CREATE TRIGGER trigger_notify_event_status_change
    AFTER UPDATE OF status ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_event_status_change();
