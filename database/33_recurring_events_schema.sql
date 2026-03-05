/*
  # Yilama Events: Recurring Events Architecture v1.0
  
  Dependencies: 04_events_and_permissions.sql, 05_ticketing_and_scanning.sql

  ## Architecture:
  - `events` remains the Parent entity ("The Series" or "The Template").
  - `event_occurrences` represents individual instances (e.g. "Every Friday at 8 PM").
  - Extends `ticket_types` to optionally bind to a specific occurrence.
  - Updates `validate_ticket_scan` to account for occurrence validity.
*/

-- 1. Create the Event Occurrences Table
create table if not exists event_occurrences (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    
    -- Specific times for this occurrence (overrides event defaults if needed)
    starts_at timestamptz not null,
    ends_at timestamptz,
    
    status text default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
    
    -- Optional Overrides (e.g., this specific occurrence has a smaller venue)
    capacity_override int,
    venue_override text,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index for fast schedule querying
create index idx_event_occurrences_event_date on event_occurrences(event_id, starts_at);


-- 2. Extend Ticket Types for Occurrence Binding
-- If event_occurrence_id is NULL, the ticket type is valid for ANY/ALL occurrences.
-- If set, it's only valid for that specific date.
do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'ticket_types' and column_name = 'event_occurrence_id') then
        alter table ticket_types add column event_occurrence_id uuid references event_occurrences(id) on delete cascade;
    end if;
end $$;


-- 3. Extend Tickets for Occurrence Binding (The actual instance sold)
-- If a user buys a ticket for "Friday", the ticket is bound to Friday's occurrence.
do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'tickets' and column_name = 'event_occurrence_id') then
        alter table tickets add column event_occurrence_id uuid references event_occurrences(id) on delete cascade;
    end if;
end $$;


-- 4. Extend Check-ins to track which occurrence was scanned
do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'ticket_checkins' and column_name = 'event_occurrence_id') then
        alter table ticket_checkins add column event_occurrence_id uuid references event_occurrences(id) on delete cascade;
    end if;
end $$;


-- 5. Updated Validation Logic for Occurrences
-- Re-defining validate_ticket_scan to enforce occurrence rules
create or replace function validate_ticket_scan_v2(
    p_ticket_public_id uuid,
    p_event_id uuid,
    p_event_occurrence_id uuid, -- The specific date being scanned right now
    p_scanner_id uuid
)
returns jsonb as $$
declare
    v_ticket_data record;
    v_already_checked_in boolean;
begin
    -- 1. Lookup Ticket safely
    select t.id, t.status, t.event_id, t.event_occurrence_id as ticket_occurrence_id, tt.name as tier_name, p.name as owner_name
    into v_ticket_data
    from tickets t
    left join ticket_types tt on t.ticket_type_id = tt.id
    left join profiles p on t.owner_user_id = p.id
    where t.public_id = p_ticket_public_id;

    -- 2. Validate Existence
    if v_ticket_data.id is null then
        return jsonb_build_object('success', false, 'message', 'Ticket not found', 'code', 'NOT_FOUND');
    end if;

    -- 3. Validate Event Match
    if v_ticket_data.event_id != p_event_id then
        insert into ticket_checkins (ticket_id, scanner_id, event_id, event_occurrence_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, p_event_occurrence_id, 'invalid_event');
        return jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    end if;

    -- 3.5 Validate Occurrence Match (If ticket is bound to a specific date)
    if v_ticket_data.ticket_occurrence_id is not null and v_ticket_data.ticket_occurrence_id != p_event_occurrence_id then
         insert into ticket_checkins (ticket_id, scanner_id, event_id, event_occurrence_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, p_event_occurrence_id, 'wrong_date');
        return jsonb_build_object('success', false, 'message', 'Ticket is not valid for this date', 'code', 'WRONG_DATE');
    end if;

    -- 4. Validate Duplicate Use (Scoped to Occurrence to allow multi-day passes if occurrence_id is null)
    select exists(
        select 1 from ticket_checkins 
        where ticket_id = v_ticket_data.id 
        and event_occurrence_id = p_event_occurrence_id 
        and result = 'success'
    ) into v_already_checked_in;

    if v_already_checked_in then
        insert into ticket_checkins (ticket_id, scanner_id, event_id, event_occurrence_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, p_event_occurrence_id, 'duplicate');
        return jsonb_build_object('success', false, 'message', 'Ticket already used today', 'code', 'DUPLICATE', 'ticket', row_to_json(v_ticket_data));
    end if;

    -- 5. Validate Status
    if v_ticket_data.status != 'valid' then
         insert into ticket_checkins (ticket_id, scanner_id, event_id, event_occurrence_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, p_event_occurrence_id, 'invalid_status');
        return jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    end if;

    -- 6. Success! Record Check-in for this specific occurrence
    insert into ticket_checkins (ticket_id, scanner_id, event_id, event_occurrence_id, result) 
    values (v_ticket_data.id, p_scanner_id, p_event_id, p_event_occurrence_id, 'success');

    -- Note: We DO NOT mark the ticket as 'used' globally if it's a multi-day pass (occurrence_id is null).
    -- We only mark it 'used' if it was a single-occurrence ticket.
    if v_ticket_data.ticket_occurrence_id is not null then
        update tickets set status = 'used', updated_at = now() where id = v_ticket_data.id;
    end if;

    return jsonb_build_object(
        'success', true, 
        'message', 'Valid Ticket', 
        'code', 'SUCCESS', 
        'ticket', jsonb_build_object(
            'tier', v_ticket_data.tier_name,
            'owner', v_ticket_data.owner_name
        )
    );
end;
$$ language plpgsql security definer;


-- 6. Triggers and RLS
create trigger update_event_occurrences_modtime before update on event_occurrences for each row execute procedure update_updated_at_column();

alter table event_occurrences enable row level security;

create policy "Public view scheduled occurrences" on event_occurrences
    for select using (
        exists (
            select 1 from events 
            where events.id = event_occurrences.event_id 
            and events.status = 'published'
        )
    );
    
create policy "Organizers manage their occurrences" on event_occurrences
    for all using (
        exists (
            select 1 from events 
            where events.id = event_occurrences.event_id 
            and events.organizer_id = auth.uid()
        )
    );
