/*
  # Yilama Events: Tier Enforcement Subsystem v1.0
  
  Dependencies: 03_financial_architecture.sql, 04_events_and_permissions.sql
  
  ## Purpose:
  Ensures that organizers stick to their operational limits (Events, Tickets, Scanners) 
  defined by their current subscription plan.
*/

-- 1. Helper: Get Organizer's Active Plan
create or replace function public.get_organizer_plan(p_user_id uuid)
returns setof public.plans as $$
begin
  return query
  select p.*
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.user_id = p_user_id
  and s.status = 'active'
  and s.current_period_end > now()
  limit 1;

  -- Fallback to Free if no active subscription found
  if not found then
    return query select * from public.plans where id = 'free';
  end if;
end;
$$ language plpgsql security definer;

-- 2. Trigger: Enforce Event Capacity Limit
-- Prevents creating new events if the plan limit is reached.
create or replace function public.fn_enforce_event_limit()
returns trigger as $$
declare
  v_limit int;
  v_count int;
begin
  -- Get limit
  select events_limit into v_limit from public.get_organizer_plan(new.organizer_id);
  
  -- Count active events (not ended/cancelled)
  select count(*) into v_count 
  from public.events 
  where organizer_id = new.organizer_id 
  and status not in ('ended', 'cancelled');

  if v_count >= v_limit then
    raise exception 'Event limit reached (%) for your current tier. Please upgrade to create more events.', v_limit
      using errcode = 'P0002'; -- Custom code for UI to catch
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_enforce_event_limit on public.events;
create trigger tr_enforce_event_limit
  before insert on public.events
  for each row execute procedure public.fn_enforce_event_limit();

-- 3. Trigger: Enforce Ticket Quota Limit
-- Prevents setting a ticket type quantity higher than the plan allows.
create or replace function public.fn_enforce_ticket_limit()
returns trigger as $$
declare
  v_limit int;
  v_organizer_id uuid;
begin
  -- Get organizer id
  select organizer_id into v_organizer_id from public.events where id = new.event_id;
  
  -- Get limit
  select tickets_limit into v_limit from public.get_organizer_plan(v_organizer_id);

  if new.quantity_limit > v_limit then
    raise exception 'Your tier allows a maximum of % tickets per event. Please upgrade to increase capacity.', v_limit
      using errcode = 'P0003';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_enforce_ticket_limit on public.ticket_types;
create trigger tr_enforce_ticket_limit
  before insert or update of quantity_limit on public.ticket_types
  for each row execute procedure public.fn_enforce_ticket_limit();

-- 4. Trigger: Enforce Team/Scanner Limit
-- Prevents adding more scanners than the plan allows.
create or replace function public.fn_enforce_scanner_limit()
returns trigger as $$
declare
  v_limit int;
  v_count int;
  v_organizer_id uuid;
begin
  -- Get organizer id
  select organizer_id into v_organizer_id from public.events where id = new.event_id;
  
  -- Get limit
  select scanners_limit into v_limit from public.get_organizer_plan(v_organizer_id);

  -- Count existing scanners for this event
  select count(*) into v_count from public.event_scanners where event_id = new.event_id;

  if v_count >= v_limit then
    raise exception 'Your tier allows a maximum of % staff scanners. Please upgrade to add more.', v_limit
      using errcode = 'P0004';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_enforce_scanner_limit on public.event_scanners;
create trigger tr_enforce_scanner_limit
  before insert on public.event_scanners
  for each row execute procedure public.fn_enforce_scanner_limit();

-- 5. RPC: Unified Usage Report for Frontend
create or replace function public.check_organizer_limits(org_id uuid)
returns jsonb as $$
declare
  v_plan record;
  v_current_events int;
begin
  -- Get plan
  select * into v_plan from public.get_organizer_plan(org_id);
  
  -- Count active events
  select count(*) into v_current_events 
  from public.events 
  where organizer_id = org_id 
  and status not in ('ended', 'cancelled');

  return jsonb_build_object(
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'events_limit', v_plan.events_limit,
    'events_current', v_current_events,
    'tickets_limit', v_plan.tickets_limit,
    'scanners_limit', v_plan.scanners_limit,
    'commission_rate', v_plan.commission_rate
  );
end;
$$ language plpgsql security definer;
