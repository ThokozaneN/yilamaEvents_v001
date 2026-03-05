/*
  # Yilama Events: Premium Seating & Venue Layouts
  
  This migration creates the relational structure necessary for the new
  zone-based seating capabilities.
  
  Tables:
  1. venue_layouts: Templates or custom mapped SVGs belonging to an organizer
  2. venue_zones: Groupings of seats with pricing multipliers (VIP, Standard)
  3. venue_seats: Individual scannable entities with positional coordinates (SVG cx/cy)
  
  Updates:
  1. events: Gets a `layout_id` to link a layout to an event instance.
  2. tickets: Gets a `seat_id` referencing a reserved/bought seat.
*/

CREATE TYPE seat_status AS ENUM ('available', 'reserved', 'sold', 'blocked');

-- 1. Venue Layouts
CREATE TABLE IF NOT EXISTS public.venue_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_template BOOLEAN DEFAULT false,
  max_capacity INTEGER NOT NULL DEFAULT 0,
  svg_structure JSONB, -- Optional raw data for mode B rendering
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Organizers can read templates and their own layouts
ALTER TABLE public.venue_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read venue layouts" ON public.venue_layouts FOR SELECT USING (true);
CREATE POLICY "Organizers manage own layouts" ON public.venue_layouts 
  FOR ALL USING (auth.uid() = organizer_id);

-- 2. Venue Zones (VIP, Economy, etc)
CREATE TABLE IF NOT EXISTS public.venue_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES public.venue_layouts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_code TEXT NOT NULL DEFAULT '#cccccc',
  price_multiplier NUMERIC(5,2) DEFAULT 1.00 CHECK (price_multiplier >= 0),
  capacity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.venue_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read venue zones" ON public.venue_zones FOR SELECT USING (true);
CREATE POLICY "Organizers manage own zones" ON public.venue_zones 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM venue_layouts WHERE venue_layouts.id = venue_zones.layout_id AND venue_layouts.organizer_id = auth.uid())
  );

-- 3. Individual Seats
CREATE TABLE IF NOT EXISTS public.venue_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.venue_zones(id) ON DELETE CASCADE,
  row_identifier TEXT NOT NULL,    -- A, B, C, etc
  seat_identifier TEXT NOT NULL,   -- 1, 2, 3, etc.
  svg_cx NUMERIC, -- Coordinate mapping for interactive UI
  svg_cy NUMERIC,
  positional_modifier NUMERIC(5,2) DEFAULT 1.00 CHECK (positional_modifier >= 0), -- e.g. 1.2 for center, 0.9 for edge
  status seat_status DEFAULT 'available',
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE, -- If bound directly to an event instance
  UNIQUE(event_id, zone_id, row_identifier, seat_identifier)
);

ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read seats" ON public.venue_seats FOR SELECT USING (true);
CREATE POLICY "Organizers manage own seats" ON public.venue_seats 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = venue_seats.event_id AND events.organizer_id = auth.uid())
  );

-- Add relation to event
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS layout_id UUID REFERENCES public.venue_layouts(id),
ADD COLUMN IF NOT EXISTS is_seated BOOLEAN DEFAULT false;

-- Add relation to tickets
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS seat_id UUID REFERENCES public.venue_seats(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_venue_zones_layout ON public.venue_zones(layout_id);
CREATE INDEX IF NOT EXISTS idx_venue_seats_event ON public.venue_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_seat ON public.tickets(seat_id);
