-- 57_event_categories.sql
-- Creates the dedicated event_categories table and seeds dynamic categories

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.event_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure specific columns exist if table was created previously with a different schema
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_categories' AND column_name='slug') THEN
        ALTER TABLE public.event_categories ADD COLUMN slug TEXT;
        -- Backfill slugs based on names
        UPDATE public.event_categories SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;
        ALTER TABLE public.event_categories ALTER COLUMN slug SET NOT NULL;
        ALTER TABLE public.event_categories ADD CONSTRAINT event_categories_slug_key UNIQUE (slug);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_categories' AND column_name='description') THEN
        ALTER TABLE public.event_categories ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_categories' AND column_name='icon') THEN
        ALTER TABLE public.event_categories ADD COLUMN icon TEXT DEFAULT '📍';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_categories' AND column_name='sort_order') THEN
        ALTER TABLE public.event_categories ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_categories' AND column_name='is_active') THEN
        ALTER TABLE public.event_categories ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Add RLS Policies
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.event_categories;
CREATE POLICY "Categories are viewable by everyone"
    ON public.event_categories FOR SELECT
    USING (is_active = true);

DROP POLICY IF EXISTS "Categories can be inserted by admins only" ON public.event_categories;
CREATE POLICY "Categories can be inserted by admins only"
    ON public.event_categories FOR INSERT
    WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS "Categories can be updated by admins only" ON public.event_categories;
CREATE POLICY "Categories can be updated by admins only"
    ON public.event_categories FOR UPDATE
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- 3. Seed initial categories
-- We use a CTE or list to simplify slug generation
INSERT INTO public.event_categories (name, slug, icon, description, sort_order) VALUES
    ('Music', 'music', '🎵', 'Concerts, festivals, and live music.', 1),
    ('Nightlife', 'nightlife', '🕺🏽', 'Clubs, parties, and vibrant night scenes.', 2),
    ('Sports', 'sports', '⚽', 'Live games, tournaments, and fitness events.', 3),
    ('Arts & Theatre', 'arts-theatre', '🎭', 'Plays, galleries, and comedy shows.', 4),
    ('Food & Drink', 'food-drink', '🍔', 'Food markets, wine tasting, and dining.', 5),
    ('Networking', 'networking', '🤝', 'Corporate events, summits, and meetups.', 6),
    ('Tech', 'tech', '💻', 'Hackathons, product launches, and dev conferences.', 7),
    ('Fashion', 'fashion', '👗', 'Runway shows, pop-up shops, and street wear.', 8),
    ('Lifestyle', 'lifestyle', '✨', 'Wellness, hobbies, and social living.', 9)
ON CONFLICT (name) DO UPDATE SET 
    slug = EXCLUDED.slug,
    icon = EXCLUDED.icon, 
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

