/*
  # Yilama Events: Phase 2 Hierarchical Seating Architecture
  
  This migration introduces `venue_sections` which act as macroscopic groupings
  for seats. This is critical for large stadiums (e.g. FNB Stadium) where
  rendering 90k individual seats simultaneously crashes the browser.
  
  Updates:
  1. Creates `venue_sections` to store SVG paths for macro-blocks.
  2. Modifies `venue_seats` to optionally link to a `section_id`.
*/

-- 1. Venue Sections (Macroscopic Blocks)
CREATE TABLE IF NOT EXISTS public.venue_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES public.venue_layouts(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "Section 142" or "North Lower"
  svg_path_data TEXT NOT NULL, -- The SVG <path d="..."> that draws this block
  color_code TEXT DEFAULT '#f3f4f6', -- The visual block color before selection
  zone_id UUID REFERENCES public.venue_zones(id) ON DELETE SET NULL, -- Tie an entire section to a pricing zone
  capacity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Same as zones/layouts
ALTER TABLE public.venue_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read venue sections" ON public.venue_sections FOR SELECT USING (true);
CREATE POLICY "Organizers manage own sections" ON public.venue_sections 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM venue_layouts WHERE venue_layouts.id = venue_sections.layout_id AND venue_layouts.organizer_id = auth.uid())
  );

-- 2. Update venue_seats to support the hierarchy
ALTER TABLE public.venue_seats
ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.venue_sections(id) ON DELETE CASCADE;

-- Index for speedy drill-downs
CREATE INDEX IF NOT EXISTS idx_venue_seats_section ON public.venue_seats(section_id);
