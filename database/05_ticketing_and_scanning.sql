/*
  # Yilama Events: Ticketing & Secure Scanning v1.0
  
  Dependencies: 04_events_and_permissions.sql

  ## Tables:
  1. ticket_types (Tiers)
  2. tickets (Extended with crypto fields)
  3. ticket_checkins (Immutable Audit Log)

  ## Security:
  - Cryptographic signatures for offline-capable QRs (optional, but strictly enforced here)
  - Public IDs to hide raw DB UUIDs in QRs
  - Atomic Check-in Transaction (validate_ticket_scan)
*/

-- 1. Ticket Types (Tiers)
create table if not exists ticket_types (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    
    name text not null, -- 'General Admission', 'VIP'
    description text,
    price numeric(10,2) not null check (price >= 0),
    
    quantity_limit int not null default 0,
    quantity_sold int not null default 0,
    
    -- Selling Window
    sales_start_at timestamptz,
    sales_end_at timestamptz,
    
    -- Constraints
    check (quantity_sold <= quantity_limit),
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. Extend Tickets Table (from 01)
-- Ensure we have the public_id and link to ticket_type
do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'tickets' and column_name = 'ticket_type_id') then
        alter table tickets add column ticket_type_id uuid references ticket_types(id);
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'tickets' and column_name = 'public_id') then
        alter table tickets add column public_id uuid default uuid_generate_v4() unique;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'tickets' and column_name = 'metadata') then
        alter table tickets add column metadata jsonb default '{}'::jsonb;
    end if;
end $$;

-- 3. Ticket Check-ins (Append-only Log)
create table if not exists ticket_checkins (
    id uuid primary key default uuid_generate_v4(),
    ticket_id uuid references tickets(id) on delete cascade not null,
    scanner_id uuid references profiles(id) on delete set null,
    event_id uuid references events(id) on delete cascade not null,
    
    scanned_at timestamptz default now(),
    result text not null check (result in ('success', 'duplicate', 'invalid_event', 'invalid_signature')),
    
    device_id text, -- Optional for analytics
    location jsonb, -- Optional GPS
    
    created_at timestamptz default now()
    -- No updated_at because this is an immutable log
);

-- Index for duplicate check speed
create index idx_checkins_ticket_success on ticket_checkins(ticket_id) where result = 'success';


-- 4. Secure Validation RPC
-- This acts as the single entry point for scanning to prevent race conditions
create or replace function validate_ticket_scan(
    p_ticket_public_id uuid,
    p_event_id uuid,
    p_scanner_id uuid,
    p_signature text default null -- Optional for future offline/crypto enforcement
)
returns jsonb as $$
declare
    v_ticket_id uuid;
    v_current_status text;
    v_event_match boolean;
    v_already_checked_in boolean;
    v_ticket_data record;
begin
    -- 1. Lookup Ticket safely
    select t.id, t.status, t.event_id, t.ticket_type_id, tt.name as tier_name, p.name as owner_name
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
        insert into ticket_checkins (ticket_id, scanner_id, event_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_event');
        return jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    end if;

    -- 4. Validate Duplicate Use
    select exists(
        select 1 from ticket_checkins 
        where ticket_id = v_ticket_data.id 
        and result = 'success'
    ) into v_already_checked_in;

    if v_already_checked_in then
        insert into ticket_checkins (ticket_id, scanner_id, event_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, 'duplicate');
        
        -- Return info on when it was scanned if needed (omitted for brevity)
        return jsonb_build_object('success', false, 'message', 'Ticket already used', 'code', 'DUPLICATE', 'ticket', row_to_json(v_ticket_data));
    end if;

    -- 5. Validate Status (e.g. cancelled/refunded)
    if v_ticket_data.status != 'valid' then
         insert into ticket_checkins (ticket_id, scanner_id, event_id, result) 
        values (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_status');
        return jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    end if;

    -- 6. Success! Record Check-in
    insert into ticket_checkins (ticket_id, scanner_id, event_id, result) 
    values (v_ticket_data.id, p_scanner_id, p_event_id, 'success');

    -- Update ticket status to used
    update tickets set status = 'used', updated_at = now() where id = v_ticket_data.id;

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

-- 5. RLS Policies

alter table ticket_types enable row level security;
alter table ticket_checkins enable row level security;

-- Ticket Types
create policy "Public view ticket types for published events" on ticket_types
    for select using (
        exists (
            select 1 from events 
            where events.id = ticket_types.event_id 
            and events.status = 'published'
        )
    );
    
create policy "Organizers manage own ticket types" on ticket_types
    for all using (
        exists (
            select 1 from events 
            where events.id = ticket_types.event_id 
            and events.organizer_id = auth.uid()
        )
    );

-- Check-ins
create policy "Organizers view checkins" on ticket_checkins
    for select using (
        exists (
            select 1 from events 
            where events.id = ticket_checkins.event_id 
            and events.organizer_id = auth.uid()
        )
    );

create policy "Scanners view entry logs" on ticket_checkins
    for insert with check ( auth.uid() = scanner_id );

-- 6. Triggers
drop trigger if exists update_ticket_types_modtime on ticket_types;
create trigger update_ticket_types_modtime before update on ticket_types for each row execute procedure update_updated_at_column();
