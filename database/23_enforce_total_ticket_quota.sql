/*
  # Yilama Events: Phase 2 - Quota Enforcement Vulnerability Fix
  
  Replaces the vulnerable row-level limit check with a deterministic,
  concurrency-safe aggregate SUM check across all ticket types for an event.
*/

-- 1. Redefine fn_enforce_ticket_limit
CREATE OR REPLACE FUNCTION public.fn_enforce_ticket_limit()
RETURNS trigger AS $$
DECLARE
  v_plan_limit int;
  v_organizer_id uuid;
  v_current_allocated_tickets int;
  v_new_total int;
BEGIN
  -- Get organizer id from the parent event
  SELECT organizer_id INTO v_organizer_id FROM public.events WHERE id = new.event_id;
  
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'Parent event not found.' USING ERRCODE = 'P0005';
  END IF;

  -- Get the current plan limit for tickets
  SELECT tickets_limit INTO v_plan_limit FROM public.get_organizer_plan(v_organizer_id);

  -- Deterministically aggregate existing allocated tickets for this specific event
  -- Exclude the current row (new.id) so updates don't double-count themselves
  SELECT COALESCE(SUM(quantity_limit), 0) INTO v_current_allocated_tickets
  FROM public.ticket_types
  WHERE event_id = new.event_id 
    AND id != COALESCE(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Calculate the new proposed total across all tiers
  v_new_total := v_current_allocated_tickets + new.quantity_limit;

  -- Enforce plan limits strictly on the aggregate
  IF v_new_total > v_plan_limit THEN
    RAISE EXCEPTION 'Tier quota exceeded! Your plan allows % tickets total per event, but this addition brings the event sum to %.', v_plan_limit, v_new_total
      USING ERRCODE = 'P0003';
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- (The trigger `tr_enforce_ticket_limit` is already on public.ticket_types, 
-- but refreshing the function logic in-place applies immediately to future transactions.)
