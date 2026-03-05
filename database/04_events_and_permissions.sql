/*
  # Yilama Events: Event System & Access Control v1.0
  
  Dependencies: 03_financial_architecture.sql

  ## Tables:
  1. events (Core domain entity - already created in 01, extending here)
  2. event_team_members (Co-organizers/Staff)
  3. event_scanners (Gate access control)

  ## Security:
  - RLS Policies for Organizer/Scanner access
  - Helper Functions for Authorization (owns_event, is_event_scanner)
  - Lifecycle Constraints
*/

-- 1. Extend Events Table (if needed) & Add Constraints
-- Note: 'events' was created in 01_core_architecture_contract.sql.
-- Here we add specific constraints or indexes if missing.

do $$ begin
    if not exists (select 1 from information_schema.columns where table_name = 'events' and column_name = 'max_capacity') then
        alter table events add column max_capacity int default 0;
    end if;
     if not exists (select 1 from information_schema.columns where table_name = 'events' and column_name = 'is_private') then
        alter table events add column is_private boolean default false;
    end if;
end $$;

-- 2. Event Access Control Components

-- Team Members (Co-organizers)
create table if not exists event_team_members (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    user_id uuid references profiles(id) on delete cascade not null,
    
    role text default 'staff', -- 'admin', 'editor', 'viewer'
    
    invited_at timestamptz default now(),
    accepted_at timestamptz,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    unique(event_id, user_id)
);

-- Event Scanners (Gate Staff)
create table if not exists event_scanners (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    user_id uuid references profiles(id) on delete cascade not null,
    
    is_active boolean default true,
    gate_name text, -- 'Main Entrance', 'VIP Gate'
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    unique(event_id, user_id)
);

-- 3. Authorization Helper Functions

-- Check if user is the primary organizer
create or replace function owns_event(f_event_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from events
    where id = f_event_id
    and organizer_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- Check if user is an assigned scanner for an event
create or replace function is_event_scanner(f_event_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from event_scanners
    where event_id = f_event_id
    and user_id = auth.uid()
    and is_active = true
  );
end;
$$ language plpgsql security definer;

-- Check if user is a team member with permission
create or replace function is_event_team_member(f_event_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from event_team_members
    where event_id = f_event_id
    and user_id = auth.uid()
    and accepted_at is not null
  );
end;
$$ language plpgsql security definer;

-- 4. RLS Policies

-- Enable RLS
alter table events enable row level security; -- Already enabled, safe to re-run
alter table event_team_members enable row level security;
alter table event_scanners enable row level security;

-- Events Policies (Re-defining for clarity/completeness)

-- Organizers CRUD own events
drop policy if exists "Organizers manage own events" on events;
create policy "Organizers manage own events"
  on events for all
  using ( auth.uid() = organizer_id );

-- Public read published events
drop policy if exists "Public view published events" on events;
create policy "Public view published events"
  on events for select
  using ( 
    status = 'published' 
    and (is_private = false or is_private is null)
  );

-- Scanners read assigned events
drop policy if exists "Scanners view assigned events" on events;
create policy "Scanners view assigned events"
  on events for select
  using ( is_event_scanner(id) );
  
-- Team Members read assigned events
drop policy if exists "Team members view assigned events" on events;
create policy "Team members view assigned events"
  on events for select
  using ( is_event_team_member(id) );


-- Event Team Members Policies

-- Organizers manage team
drop policy if exists "Organizers manage team members" on event_team_members;
create policy "Organizers manage team members"
  on event_team_members for all
  using ( owns_event(event_id) );

-- Users view own membership
drop policy if exists "Users view own team membership" on event_team_members;
create policy "Users view own team membership"
  on event_team_members for select
  using ( auth.uid() = user_id );

-- Event Scanners Policies

-- Organizers manage scanners
drop policy if exists "Organizers manage scanners" on event_scanners;
create policy "Organizers manage scanners"
  on event_scanners for all
  using ( owns_event(event_id) );

-- Scanners view own assignment
drop policy if exists "Scanners view own assignment" on event_scanners;
create policy "Scanners view own assignment"
  on event_scanners for select
  using ( auth.uid() = user_id );

-- 5. Triggers for updated_at (Idempotent)
drop trigger if exists update_event_team_members_modtime on event_team_members;
create trigger update_event_team_members_modtime before update on event_team_members for each row execute procedure update_updated_at_column();

drop trigger if exists update_event_scanners_modtime on event_scanners;
create trigger update_event_scanners_modtime before update on event_scanners for each row execute procedure update_updated_at_column();
