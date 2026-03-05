-- Remove AI popularity score if it was just added (Keep column for now to avoid breaking other logic, but we won't use it)
-- ALTER TABLE public.events DROP COLUMN IF EXISTS ai_popularity_score;

-- Create the refined Sales-Driven Trending Events RPC
CREATE OR REPLACE FUNCTION get_trending_events(p_lat FLOAT DEFAULT NULL, p_lng FLOAT DEFAULT NULL)
RETURNS SETOF events AS $$
BEGIN
    RETURN QUERY
    WITH EventStats AS (
        SELECT 
            e.id,
            -- Sales velocity: current sold / total limit (capped at 1.0)
            COALESCE(
                (SELECT LEAST(SUM(quantity_sold)::NUMERIC / NULLIF(SUM(quantity_limit), 0), 1.0)
                 FROM ticket_types WHERE event_id = e.id),
                0
            ) as sales_velocity,
            -- Total sold count
            COALESCE(
                (SELECT SUM(quantity_sold) FROM ticket_types WHERE event_id = e.id),
                0
            ) as total_sold,
            -- Distance calculation (if coords provided)
            CASE 
                WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL THEN
                    (6371 * acos(cos(radians(p_lat)) * cos(radians(e.latitude)) * cos(radians(e.longitude) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(e.latitude))))
                ELSE NULL
            END as distance
        FROM events e
        WHERE e.status = 'published'
    )
    SELECT e.*
    FROM events e
    JOIN EventStats s ON e.id = s.id
    JOIN profiles p ON e.organizer_id = p.id
    WHERE e.status = 'published'
    AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= NOW()
    AND s.total_sold >= 5 -- Enforce minimum sales threshold
    ORDER BY 
        -- If location provided, distance is the primary factor (within 50km)
        CASE WHEN s.distance <= 50 THEN 1 ELSE 2 END,
        -- Global ranking score (Simplified: 70% Sales Velocity, 30% Premium Boost)
        (
            (s.sales_velocity * 0.7) + 
            (CASE WHEN p.organizer_tier = 'premium' THEN 0.3 ELSE 0 END)
        ) DESC,
        e.starts_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
