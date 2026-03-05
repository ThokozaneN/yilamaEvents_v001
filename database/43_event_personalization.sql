/*
  # Yilama Events: Event Personalization Engine
  
  Provides a scalable, query-based recommendation algorithm 
  combining trending popularity, past category preferences, 
  and loyalty boosts (past organizers).
*/

-- Create a robust type explicitly matching our expected shape if needed, 
-- but returning SETOF events is usually perfectly sufficient if we just SELECT *.
-- Since we want to return * and a dynamic score to sort by, we will join cleanly.

CREATE OR REPLACE FUNCTION get_personalized_events(p_user_id UUID DEFAULT NULL)
RETURNS SETOF events AS $$
BEGIN
    IF p_user_id IS NULL THEN
        -- Fallback: Trending only (Global)
        RETURN QUERY
        SELECT e.* 
        FROM events e
        WHERE e.status = 'published'
        AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= NOW()
        ORDER BY 
            -- Trending metric: total_sold / total_capacity
            COALESCE(
              (SELECT CASE WHEN SUM(quantity_limit) > 0 THEN SUM(quantity_sold)::NUMERIC / SUM(quantity_limit)::NUMERIC ELSE 0 END 
               FROM ticket_types WHERE event_id = e.id), 
            0) DESC,
            e.created_at DESC;
    ELSE
        -- Personalized Ranking
        RETURN QUERY
        WITH
            -- 1. Get user's past categories (Preference)
            PastCategories AS (
                SELECT DISTINCT e.category_id
                FROM tickets t
                JOIN events e ON t.event_id = e.id
                WHERE t.owner_user_id = p_user_id AND e.category_id IS NOT NULL
            ),
            
            -- 2. Get organizers user has bought from (Loyalty)
            PastOrganizers AS (
                SELECT DISTINCT e.organizer_id
                FROM tickets t
                JOIN events e ON t.event_id = e.id
                WHERE t.owner_user_id = p_user_id
            ),
            
            -- 3. Calculate Scores for published events
            ScoredEvents AS (
                SELECT 
                    e.*,
                    
                    -- Base Score: Trending Capacity (0.0 to 1.0 multiplier, let's scale to 10 max)
                    COALESCE(
                      (SELECT CASE WHEN SUM(quantity_limit) > 0 THEN (SUM(quantity_sold)::NUMERIC / SUM(quantity_limit)::NUMERIC) * 10 ELSE 0 END 
                       FROM ticket_types WHERE event_id = e.id), 
                    0) 
                    
                    -- Preference Boost (+10 for matching category)
                    + CASE WHEN e.category_id IN (SELECT category_id FROM PastCategories) THEN 10 ELSE 0 END
                    
                    -- Loyalty Boost (+5 for matching organizer)
                    + CASE WHEN e.organizer_id IN (SELECT organizer_id FROM PastOrganizers) THEN 5 ELSE 0 END
                    
                    AS total_score
                FROM events e
                WHERE e.status = 'published'
                AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= NOW()
            )
            
        -- Use e.* via CTE to avoid column list mismatches caused by schema evolution
        SELECT 
           (SELECT e FROM events e WHERE e.id = ScoredEvents.id).*
        FROM ScoredEvents
        ORDER BY total_score DESC, starts_at ASC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
