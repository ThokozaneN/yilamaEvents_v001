/*
  # Yilama Events: Resale & Transfers v1.0
  
  Dependencies: 06_revenue_and_settlements.sql

  ## Tables:
  1. ticket_transfers (Direct P2P sending)
  2. resale_listings (Marketplace)

  ## Security:
  - RLS Policies: Only ticket owners can list/transfer
  - Role Restrictions: Organizers cannot participate in resale (prevent wash trading)
  - Integrity: Transfers must be strictly atomic (handled via RPC ideally, but schema here)
*/

-- 1. Ticket Transfers (Direct Send)
create table if not exists ticket_transfers (
    id uuid primary key default uuid_generate_v4(),
    ticket_id uuid references tickets(id) on delete cascade not null,
    
    sender_user_id uuid references profiles(id) not null,
    recipient_email text not null,
    recipient_user_id uuid references profiles(id), -- Null until claimed
    
    status text default 'pending', -- pending, accepted, cancelled, expired
    
    msg text,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. Resale Listings (Marketplace)
create table if not exists resale_listings (
    id uuid primary key default uuid_generate_v4(),
    ticket_id uuid references tickets(id) on delete cascade not null,
    seller_user_id uuid references profiles(id) not null,
    
    original_price numeric(10,2) not null,
    resale_price numeric(10,2) not null check (resale_price > 0),
    
    -- Price Cap Logic (e.g. Max 110% of original) 
    -- We can enforce via trigger, but schema constraint is basic start.
    
    status text default 'active', -- active, sold, cancelled
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    unique(ticket_id, status) -- Prevent multiple active listings for same ticket
);

-- 3. RLS Policies

alter table ticket_transfers enable row level security;
alter table resale_listings enable row level security;

-- Transfers Policies
create policy "Users manage transfers they sent" on ticket_transfers
    for all using (auth.uid() = sender_user_id);
    
create policy "Recipients view incoming transfers" on ticket_transfers
    for select using (
        (recipient_user_id = auth.uid()) or 
        (recipient_email = (select email from auth.users where id = auth.uid()))
    );

-- Resale Listings Policies
create policy "Public view active listings" on resale_listings
    for select using (status = 'active');

create policy "Sellers manage own listings" on resale_listings
    for all using (auth.uid() = seller_user_id);

-- 4. Triggers needed for updated_at
create trigger update_ticket_transfers_modtime before update on ticket_transfers for each row execute procedure update_updated_at_column();
create trigger update_resale_listings_modtime before update on resale_listings for each row execute procedure update_updated_at_column();

-- 5. Helper: Prevent Organizer Resale (Trigger)
create or replace function prevent_organizer_resale()
returns trigger as $$
declare
    v_role user_role;
begin
    select role into v_role from profiles where id = new.seller_user_id;
    if v_role = 'organizer' then
        raise exception 'Organizers cannot list tickets for resale.';
    end if;
     -- Also verify ownership
    if not exists (select 1 from tickets where id = new.ticket_id and owner_user_id = new.seller_user_id) then
        raise exception 'You do not own this ticket.';
    end if;
    return new;
end;
$$ language plpgsql;

create trigger check_resale_eligibility
    before insert on resale_listings
    for each row
    execute procedure prevent_organizer_resale();
