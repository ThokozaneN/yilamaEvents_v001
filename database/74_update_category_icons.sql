-- 74_update_category_icons.sql
-- Replaces category emojis with professional Lucide icon names

-- 1. Update public.event_categories (Primary modern table)
UPDATE public.event_categories SET icon = 'music' WHERE name = 'Music';
UPDATE public.event_categories SET icon = 'moon' WHERE name = 'Nightlife';
UPDATE public.event_categories SET icon = 'trophy' WHERE name = 'Sports';
UPDATE public.event_categories SET icon = 'theater' WHERE name = 'Arts & Theatre';
UPDATE public.event_categories SET icon = 'utensils' WHERE name = 'Food & Drink';
UPDATE public.event_categories SET icon = 'users' WHERE name = 'Networking';
UPDATE public.event_categories SET icon = 'cpu' WHERE name = 'Tech';
UPDATE public.event_categories SET icon = 'shopping-bag' WHERE name = 'Fashion';
UPDATE public.event_categories SET icon = 'sparkles' WHERE name = 'Lifestyle';

-- Ensure description for Lifestyle is consistent
UPDATE public.event_categories SET description = 'Wellness, hobbies, and social living.' WHERE name = 'Lifestyle';

-- 2. Update public.categories (Legacy / Frontend helper table from migration 10)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories') THEN
        UPDATE public.categories SET icon = 'music' WHERE name = 'Music';
        UPDATE public.categories SET icon = 'moon' WHERE name = 'Nightlife';
        UPDATE public.categories SET icon = 'trophy' WHERE name = 'Sports';
        UPDATE public.categories SET icon = 'theater' WHERE name = 'Arts'; -- Migration 10 used 'Arts'
        UPDATE public.categories SET icon = 'utensils' WHERE name = 'Food & Drink';
        UPDATE public.categories SET icon = 'users' WHERE name = 'Community'; -- Migration 10 used 'Community'
        UPDATE public.categories SET icon = 'cpu' WHERE name = 'Tech';
        UPDATE public.categories SET icon = 'briefcase' WHERE name = 'Business'; -- Added in Migration 10
    END IF;
END $$;
