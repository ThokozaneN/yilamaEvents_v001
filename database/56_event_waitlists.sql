-- 56_event_waitlists.sql
--
-- Introduces the "Coming Soon" event status and the waitlist table.

-- 1. Create the Waitlists Table
CREATE TABLE IF NOT EXISTS event_waitlists (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    email text NOT NULL,
    
    status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified')),
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Prevent duplicate waitlist entries per email per event
    UNIQUE(event_id, email)
);

-- 2. Add Triggers for updated_at
DROP TRIGGER IF EXISTS update_event_waitlists_modtime ON event_waitlists;
CREATE TRIGGER update_event_waitlists_modtime 
    BEFORE UPDATE ON event_waitlists 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- 3. RLS Policies
ALTER TABLE event_waitlists ENABLE ROW LEVEL SECURITY;

-- Organizers can see the waitlist for their events
CREATE POLICY "Organizers view own event waitlists" ON event_waitlists
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = event_waitlists.event_id
            AND events.organizer_id = auth.uid()
        )
    );

-- Organizers can update waitlists (e.g., mark as notified)
CREATE POLICY "Organizers update own event waitlists" ON event_waitlists
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = event_waitlists.event_id
            AND events.organizer_id = auth.uid()
        )
    );

-- Public can insert themselves into waitlists
CREATE POLICY "Public can join waitlists" ON event_waitlists
    FOR INSERT
    WITH CHECK (true);

-- Users can see their own waitlist entries
CREATE POLICY "Users view own waitlists" ON event_waitlists
    FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

-- 4. Waitlist Webhook Trigger
-- Fires when an event changes status from 'coming_soon' to 'published' or 'cancelled'
CREATE OR REPLACE FUNCTION execute_waitlist_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payload jsonb;
  v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/process-waitlist';
  v_anon_key text;
BEGIN
  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', row_to_json(OLD)
  );

  BEGIN
    SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';
  EXCEPTION WHEN OTHERS THEN
    v_anon_key := 'unknown';
  END;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, 'unknown')
    ),
    body := v_payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_process_waitlist ON events;
CREATE TRIGGER trigger_process_waitlist
  AFTER UPDATE OF status ON events
  FOR EACH ROW
  WHEN (OLD.status = 'coming_soon' AND NEW.status IN ('published', 'cancelled'))
  EXECUTE FUNCTION execute_waitlist_webhook();
