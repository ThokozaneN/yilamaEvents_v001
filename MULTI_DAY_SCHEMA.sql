-- Create a new table for event dates (multi-day events)
CREATE TABLE event_dates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ, -- optional, if null could mean "overnight" or "TBD"
    venue TEXT,          -- override venue for this date
    lineup TEXT[],       -- override lineup for this date
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE event_dates ENABLE ROW LEVEL SECURITY;

-- Policies for event_dates (mirror event policies)
CREATE POLICY "Public can view event dates" 
    ON event_dates FOR SELECT 
    USING (true);

CREATE POLICY "Organizers can insert dates for their own events" 
    ON event_dates FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM events e 
            WHERE e.id = event_dates.event_id 
            AND e.organizer_id = auth.uid()
        )
    );

CREATE POLICY "Organizers can update dates for their own events" 
    ON event_dates FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM events e 
            WHERE e.id = event_dates.event_id 
            AND e.organizer_id = auth.uid()
        )
    );

CREATE POLICY "Organizers can delete dates for their own events" 
    ON event_dates FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM events e 
            WHERE e.id = event_dates.event_id 
            AND e.organizer_id = auth.uid()
        )
    );

-- Update ticket_types to link to specific dates
ALTER TABLE ticket_types 
ADD COLUMN event_date_id UUID REFERENCES event_dates(id) ON DELETE SET NULL;

-- If event_date_id is NULL, the ticket is valid for "All Dates" or the main event duration.

-- Function to update event_dates timestamp
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON event_dates
    FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
