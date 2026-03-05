/*
  # Yilama Events: Experiences Architecture (Stub/Concept)
  
  Lays the foundation for the Expansion Domain (Phase 9), focusing
  on time-slot booking and availability models distinct from
  capacity-based ticketing.
*/

-- 1. Experiences (The parent product offering, e.g., "Wine Tasting Tour")
CREATE TABLE IF NOT EXISTS experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location_data TEXT, -- Can be JSONB for lat/long or a simple string
    base_price NUMERIC NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published experiences" ON experiences FOR SELECT USING (status = 'published');
CREATE POLICY "Organizers can manage their own experiences" ON experiences FOR ALL USING (auth.uid() = organizer_id);

-- 2. Experience Sessions (The specific time slots, e.g., "Saturday 10:00 AM")
CREATE TABLE IF NOT EXISTS experience_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experience_id UUID REFERENCES experiences(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    max_capacity INT NOT NULL DEFAULT 10,
    booked_count INT NOT NULL DEFAULT 0,
    price_override NUMERIC, -- If a specific slot costs more (e.g., sunset tour)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'full')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE experience_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active sessions" ON experience_sessions FOR SELECT USING (status = 'active');
-- Note: A more complex policy joining on experiences is needed for Organizer management.

-- 3. Experience Reservations (The soft-locking cart mechanism)
CREATE TABLE IF NOT EXISTS experience_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES experience_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- Buyer
    quantity INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL, -- Core to the locking strategy
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE experience_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own reservations" ON experience_reservations FOR SELECT USING (auth.uid() = user_id);

-- Trigger: Automatically update updated_at timestamps
-- (Assuming handle_updated_at function exists from 01_initial_schema)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at') THEN
        CREATE TRIGGER set_timestamp_experiences BEFORE UPDATE ON experiences FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();
        CREATE TRIGGER set_timestamp_reservations BEFORE UPDATE ON experience_reservations FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();
    END IF;
END $$;
