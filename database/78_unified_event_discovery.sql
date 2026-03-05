-- =============================================================================
-- 78_unified_event_discovery.sql
--
-- Performance Fix: Merges the sequential get_personalized_events and
-- get_trending_events RPCs into a single combined RPC that also joins
-- all necessary enrichment data (ticket_types, organizer profiles).
-- This reduces the number of network roundtrips from 4 down to 1.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_discovery_events(p_user_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    v_personalized_events jsonb;
    v_trending_events jsonb;
    v_now timestamptz := now();
BEGIN
    -- 1. Fetch Personalized Events (Enriched)
    WITH raw_personalized AS (
        SELECT id FROM get_personalized_events(p_user_id)
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'description', e.description,
            'venue', e.venue,
            'image_url', e.image_url,
            'category', e.category,
            'starts_at', e.starts_at,
            'ends_at', e.ends_at,
            'status', e.status,
            'is_seated', e.is_seated,
            'created_at', e.created_at,
            'organizer_id', e.organizer_id,
            'tiers', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', tt.id,
                        'name', tt.name,
                        'price', tt.price,
                        'quantity_limit', tt.quantity_limit,
                        'quantity_sold', tt.quantity_sold
                    )
                ), '[]'::jsonb)
                FROM ticket_types tt
                WHERE tt.event_id = e.id
            ),
            'organizer', jsonb_build_object(
                'business_name', p.business_name,
                'organizer_status', p.organizer_status,
                'organizer_tier', p.organizer_tier,
                'instagram_handle', p.instagram_handle,
                'twitter_handle', p.twitter_handle,
                'facebook_handle', p.facebook_handle,
                'website_url', p.website_url
            )
        )
    ), '[]'::jsonb) INTO v_personalized_events
    FROM raw_personalized rp
    JOIN events e ON e.id = rp.id
    LEFT JOIN profiles p ON p.id = e.organizer_id
    WHERE e.status = 'published' AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= v_now;

    -- 2. Fetch Trending Events (Enriched)
    WITH raw_trending AS (
        SELECT id FROM get_trending_events() LIMIT 10
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'description', e.description,
            'venue', e.venue,
            'image_url', e.image_url,
            'category', e.category,
            'starts_at', e.starts_at,
            'ends_at', e.ends_at,
            'status', e.status,
            'is_seated', e.is_seated,
            'created_at', e.created_at,
            'organizer_id', e.organizer_id,
            'tiers', (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id', tt.id,
                        'name', tt.name,
                        'price', tt.price,
                        'quantity_limit', tt.quantity_limit,
                        'quantity_sold', tt.quantity_sold
                    )
                ), '[]'::jsonb)
                FROM ticket_types tt
                WHERE tt.event_id = e.id
            ),
            'organizer', jsonb_build_object(
                'business_name', p.business_name,
                'organizer_status', p.organizer_status,
                'organizer_tier', p.organizer_tier,
                'instagram_handle', p.instagram_handle,
                'twitter_handle', p.twitter_handle,
                'facebook_handle', p.facebook_handle,
                'website_url', p.website_url
            )
        )
    ), '[]'::jsonb) INTO v_trending_events
    FROM raw_trending rt
    JOIN events e ON e.id = rt.id
    LEFT JOIN profiles p ON p.id = e.organizer_id
    WHERE e.status = 'published' AND COALESCE(e.ends_at, e.starts_at + interval '6 hours') >= v_now;

    -- 3. Return Combined Payload
    RETURN jsonb_build_object(
        'personalized', v_personalized_events,
        'trending', v_trending_events
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
