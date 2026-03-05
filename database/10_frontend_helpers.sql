/*
  # Yilama Events: Frontend Compatibility & Helper Layer v1.0
  
  Dependencies: 09_storage_buckets.sql

  ## Purpose:
  This file bridges the gap between the frontend UI (Wizard, Wallet, Scanner) and the Core Schema.
  It adds missing tables, views, and RPC wrappers expected by the frontend code.

  ## Components:
  1. Multi-Day Event Support (`event_dates`, `ticket_types` extension)
  2. Categories Table (Standardized list)
  3. Transfer Logic (`initiate_transfer`, `respond_to_transfer`)
  4. Scanner Compatibility (`scan_ticket` wrapper)
  5. Dashboard Stubs (`check_organizer_limits`, `is_organizer_ready`)
*/

-- 1. Categories Table (Frontend expects this for dropdowns)
create table if not exists categories (
    id uuid primary key default uuid_generate_v4(),
    name text unique not null,
    slug text unique not null,
    icon text,
    created_at timestamptz default now()
);

-- Seed Categories (Idempotent)
insert into categories (name, slug, icon) values
('Music', 'music', '🎵'),
('Nightlife', 'nightlife', '🍸'),
('Business', 'business', '💼'),
('Tech', 'tech', '💻'),
('Food & Drink', 'food-drink', '🍔'),
('Arts', 'arts', '🎨'),
('Sports', 'sports', '⚽'),
('Community', 'community', '🤝')
on conflict (name) do nothing;

alter table categories enable row level security;
create policy "Public view categories" on categories for select using (true);


-- 2. Multi-Day Event Support
create table if not exists event_dates (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    
    starts_at timestamptz not null,
    ends_at timestamptz,
    
    venue text, -- Optional override
    lineup text[], -- Optional override
    
    created_at timestamptz default now()
);

alter table event_dates enable row level security;
create policy "Public view event dates" on event_dates for select using (true);
create policy "Organizers manage event dates" on event_dates for all using (
    exists (select 1 from events where id = event_dates.event_id and organizer_id = auth.uid())
);

-- Extend Ticket Types to link to specific dates
do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'ticket_types' and column_name = 'event_date_id') then
        alter table ticket_types add column event_date_id uuid references event_dates(id) on delete set null;
    end if;
end $$;


-- 3. Transfer Logic (RPCs)

-- View for Wallet
create or replace view v_my_transfers as
select 
    t.id,
    t.ticket_id,
    t.sender_user_id as from_user_id,
    t.recipient_email as to_email,
    -- simple type mapping for frontend 'TransferType' (gift/resale)
    case when rl.id is not null then 'resale' else 'gift' end as transfer_type,
    rl.resale_price,
    t.status,
    case when t.sender_user_id = auth.uid() then 'sent' else 'received' end as direction,
    e.title as event_title,
    t.created_at
from ticket_transfers t
join tickets tk on t.ticket_id = tk.id
join events e on tk.event_id = e.id
left join resale_listings rl on rl.ticket_id = t.ticket_id and rl.status = 'active' -- Link if it was a resale
where t.sender_user_id = auth.uid() 
   or t.recipient_user_id = auth.uid() 
   or (t.recipient_email = (select email from auth.users where id = auth.uid()) and t.recipient_user_id is null);

-- Initiate Transfer RPC
create or replace function initiate_transfer(
    p_ticket_id uuid,
    p_to_email text,
    p_transfer_type text, -- 'gift' or 'resale'
    p_resale_price numeric default null
)
returns void as $$
declare
    v_sender_id uuid;
begin
    v_sender_id := auth.uid();
    
    -- Checks handled by RLS/Constraints mostly, but logic here:
    insert into ticket_transfers (ticket_id, sender_user_id, recipient_email, status, msg)
    values (p_ticket_id, v_sender_id, p_to_email, 'pending', p_transfer_type);
    
    -- If resale, create listing too (simplified logic)
    if p_transfer_type = 'resale' and p_resale_price is not null then
       -- Logic for resale listing creation would go here, 
       -- but typical flow is separate. For now we assume direct transfer
       null; 
    end if;
end;
$$ language plpgsql security definer set search_path = public;

-- Respond RPC
create or replace function respond_to_transfer(p_transfer_id uuid, p_accept boolean)
returns void as $$
declare
    v_ticket_id uuid;
    v_recipient_id uuid;
begin
    v_recipient_id := auth.uid();

    if p_accept then
        -- Update transfer status
        update ticket_transfers 
        set status = 'completed', recipient_user_id = v_recipient_id, updated_at = now()
        where id = p_transfer_id 
        and (recipient_user_id = v_recipient_id or recipient_email = (select email from auth.users where id = v_recipient_id))
        returning ticket_id into v_ticket_id;
        
        if v_ticket_id is not null then
            -- Transfer ownership
            update tickets set owner_user_id = v_recipient_id, updated_at = now() where id = v_ticket_id;
        else
             raise exception 'Transfer not found or access denied';
        end if;
    else
        update ticket_transfers 
        set status = 'cancelled', updated_at = now()
        where id = p_transfer_id 
        and (recipient_user_id = v_recipient_id or recipient_email = (select email from auth.users where id = v_recipient_id));
    end if;
end;
$$ language plpgsql security definer set search_path = public;


-- 4. Scanner Compatibility wrapper
-- Frontend calls 'scan_ticket' with { p_qr_payload, p_event_id }
-- Backend has 'validate_ticket_scan' with { p_ticket_public_id, ... }

create or replace function scan_ticket(p_qr_payload text, p_event_id uuid)
returns jsonb as $$
declare
    v_public_id uuid;
    v_scanner_id uuid;
    v_result jsonb;
begin
    v_scanner_id := auth.uid();
    
    -- Attempt to parse payload. Assuming it's just the UUID or UUID:SIG
    -- For V1, the payload from Wallet IS the public_id usually.
    -- If it has a signature (e.g. "uuid:sig"), split it.
    
    -- Simple UUID extraction (regex or split)
    -- Start with simple assumption: payload IS the public_id
    begin
        v_public_id := p_qr_payload::uuid;
    exception when others then
        return jsonb_build_object('success', false, 'reason', 'invalid_format', 'message', 'Invalid QR Format');
    end;

    -- Call the core logic
    v_result := validate_ticket_scan(v_public_id, p_event_id, v_scanner_id, null);
    
    -- Map backend result codes to frontend expected strings
    -- Backend: message, code, ticket
    -- Frontend expects: success, reason ('already_used', 'wrong_event', etc)
    
    if (v_result->>'success')::boolean then
        return jsonb_build_object(
            'success', true, 
            'attendee_name', v_result->'ticket'->>'owner',
            'ticket_type', v_result->'ticket'->>'tier'
        );
    else
        declare 
            v_code text := v_result->>'code';
            v_reason text;
        begin
            if v_code = 'DUPLICATE' then v_reason := 'already_used';
            elsif v_code = 'WRONG_EVENT' then v_reason := 'wrong_event';
            elsif v_code = 'INVALID_STATUS' then v_reason := 'error'; 
            else v_reason := 'error';
            end if;
            
            return jsonb_build_object(
                'success', false, 
                'reason', v_reason,
                'attendee_name', v_result->'ticket'->>'owner', -- Pass generic info if available
                'used_at', now() -- approximation
            );
        end;
    end if;
end;
$$ language plpgsql security definer set search_path = public;


-- 5. Dashboard Logic Stubs
create or replace function check_organizer_limits(org_id uuid)
returns jsonb as $$
begin
    -- Simple V1 stub
    return jsonb_build_object(
        'events_limit', 100,
        'events_current', (select count(*) from events where organizer_id = org_id)
    );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function is_organizer_ready(org_id uuid)
returns jsonb as $$
declare
    v_status text;
begin
    select verification_status into v_status from profiles where id = org_id;
    return jsonb_build_object(
        'ready', (v_status = 'verified'),
        'missing', case when v_status = 'verified' then '[]'::jsonb else '["verification_pending"]'::jsonb end
    );
end;
$$ language plpgsql security definer set search_path = public;
