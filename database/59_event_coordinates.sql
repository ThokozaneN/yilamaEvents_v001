-- 59_event_coordinates.sql
-- Adds geospatial capabilities to the events table for proximity searching

-- 1. Add coordinates to the events table
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;

-- 2. Create an index for faster bounding box queries (optional but good for future scaling if PostGIS is installed, using standard B-tree for now)
CREATE INDEX IF NOT EXISTS idx_events_lat_lng ON public.events (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 3. Create RPC for calculating "Distance" using the Haversine formula directly in PostgreSQL
-- This avoids needing the heavy PostGIS extension just for basic proximity sorting
CREATE OR REPLACE FUNCTION get_nearby_events(
    user_lat double precision,
    user_lng double precision,
    radius_km double precision DEFAULT 100
) 
RETURNS TABLE (
    event_id uuid,
    distance_km double precision
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        (
            6371 * acos(
                cos(radians(user_lat)) * cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(e.latitude))
            )
        ) AS distance_km
    FROM 
        public.events e
    WHERE 
        e.latitude IS NOT NULL 
        AND e.longitude IS NOT NULL
        AND e.status IN ('published', 'draft', 'coming_soon') -- Adjust as necessary
    HAVING 
        (
            6371 * acos(
                cos(radians(user_lat)) * cos(radians(e.latitude)) *
                cos(radians(e.longitude) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(e.latitude))
            )
        ) <= radius_km
    ORDER BY 
        distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
