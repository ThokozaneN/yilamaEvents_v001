/*
  # Yilama Events: Experiences Seed Data
  
  Populates the `experiences` and `experience_sessions` tables
  with sample dynamic data for the Explore MVP.
*/

DO $$
DECLARE
    v_org_id UUID;
    v_exp1_id UUID;
    v_exp2_id UUID;
    v_exp3_id UUID;
BEGIN
    -- 1. Grab an arbitrary organizer to own these experiences
    SELECT id INTO v_org_id FROM profiles WHERE role = 'organizer' LIMIT 1;
    
    IF v_org_id IS NULL THEN
       RAISE NOTICE 'No organizer found. Skipping experience seed.';
       RETURN;
    END IF;

    -- 2. Insert Experiences
    -- The Wine Tram
    INSERT INTO experiences (organizer_id, title, description, location_data, base_price, status, image_url, category)
    VALUES (
        v_org_id, 
        'Franschhoek Wine Tram', 
        'Experience the breathtaking Cape Winelands on a hop-on hop-off tour showcasing picturesque vineyards, stunning scenery, and premium wine tastings.', 
        'Cape Winelands', 
        850.00, 
        'published',
        'https://images.unsplash.com/photo-1549419161-0d29ab2bedd0?q=80&w=2070&auto=format&fit=crop',
        'Tour'
    ) RETURNING id INTO v_exp1_id;

    -- Sunset Hike
    INSERT INTO experiences (organizer_id, title, description, location_data, base_price, status, image_url, category)
    VALUES (
        v_org_id, 
        'Table Mountain Sunset Hike', 
        'A guided adventure to the summit of Table Mountain. Enjoy unparalleled panoramic views of Cape Town as the sun sets over the Atlantic Ocean.', 
        'Cape Town', 
        300.00, 
        'published',
        'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?q=80&w=2070&auto=format&fit=crop',
        'Adventure'
    ) RETURNING id INTO v_exp2_id;

    -- Chefs Table
    INSERT INTO experiences (organizer_id, title, description, location_data, base_price, status, image_url, category)
    VALUES (
        v_org_id, 
        'Chef''s Table Exclusive', 
        'An intimate, multi-course culinary journey hosted by a renowned local chef. A fusion of modern African flavors and fine dining techniques.', 
        'Johannesburg', 
        1500.00, 
        'published',
        'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1974&auto=format&fit=crop',
        'Dining'
    ) RETURNING id INTO v_exp3_id;

    -- 3. Insert Sessions for each
    -- Wine Tram (Multiple Morning Slots)
    INSERT INTO experience_sessions (experience_id, start_time, end_time, max_capacity, price_override) VALUES
    (v_exp1_id, (now() + INTERVAL '2 days' + INTERVAL '10 hours'), (now() + INTERVAL '2 days' + INTERVAL '16 hours'), 20, NULL),
    (v_exp1_id, (now() + INTERVAL '3 days' + INTERVAL '10 hours'), (now() + INTERVAL '3 days' + INTERVAL '16 hours'), 20, NULL),
    (v_exp1_id, (now() + INTERVAL '4 days' + INTERVAL '11 hours'), (now() + INTERVAL '4 days' + INTERVAL '17 hours'), 15, 950.00); -- Weekend premium

    -- Sunset Hike
    INSERT INTO experience_sessions (experience_id, start_time, end_time, max_capacity, price_override) VALUES
    (v_exp2_id, (now() + INTERVAL '1 day' + INTERVAL '16 hours'), (now() + INTERVAL '1 day' + INTERVAL '19 hours'), 10, NULL),
    (v_exp2_id, (now() + INTERVAL '2 days' + INTERVAL '16 hours'), (now() + INTERVAL '2 days' + INTERVAL '19 hours'), 10, NULL);

    -- Chefs Table
    INSERT INTO experience_sessions (experience_id, start_time, end_time, max_capacity, price_override) VALUES
    (v_exp3_id, (now() + INTERVAL '5 days' + INTERVAL '19 hours'), (now() + INTERVAL '5 days' + INTERVAL '22 hours'), 6, NULL),
    (v_exp3_id, (now() + INTERVAL '12 days' + INTERVAL '19 hours'), (now() + INTERVAL '12 days' + INTERVAL '22 hours'), 6, NULL);

    RAISE NOTICE 'Experiences successfully seeded.';
END $$;
