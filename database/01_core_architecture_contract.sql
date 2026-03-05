/*
  # Yilama Events: Core Architecture Contract v1.0
  
  This file establishes the foundational rules for the Yilama Events backend.
  It is designed to be idempotent (safe to run multiple times).

  ## Rules Enforced:
  1. UUID Extensions enabled.
  2. Common Trigger Functions (updated_at).
  3. Core Enums (UserRole, OrganizerStatus) defined.
  4. RLS enabled on core tables.
*/

-- 1. Enable Required Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 2. Define Enum Types (Idempotent)
do $$ begin
    create type user_role as enum ('attendee', 'organizer', 'admin', 'scanner');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type organizer_status as enum ('draft', 'pending', 'verified', 'rejected', 'suspended');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type ticket_status as enum ('valid', 'used', 'refunded', 'cancelled');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type event_category_enum as enum ('Music', 'Arts', 'Food', 'Business', 'Technology', 'Sports', 'Other');
exception
    when duplicate_object then null;
end $$;

-- 3. Common Trigger Function for updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

-- 4. Review Core Tables & Enforce Contracts

-- PROFILES (Users)
create table if not exists profiles (
    id uuid references auth.users on delete cascade primary key,
    email text unique,
    role user_role default 'attendee',
    
    -- Organizer Specifics
    organizer_status organizer_status default 'draft',
    business_name text,
    
    -- Timestamps
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- EVENTS
create table if not exists events (
    id uuid primary key default uuid_generate_v4(),
    organizer_id uuid references profiles(id) on delete cascade not null,
    
    title text not null,
    description text,
    venue text,
    category event_category_enum default 'Music',
    
    starts_at timestamptz not null,
    ends_at timestamptz,
    
    image_url text,
    status text default 'draft', -- published, draft, cancelled, ended
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- TICKETS
create table if not exists tickets (
    id uuid primary key default uuid_generate_v4(),
    event_id uuid references events(id) on delete cascade not null,
    owner_user_id uuid references profiles(id) on delete set null,
    
    status ticket_status default 'valid',
    price decimal(10,2) default 0.00,
    
    -- Security
    secret_key text, -- For HMAC signing
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- SCAN LOGS (Immutable Audit Trail)
create table if not exists scan_logs (
    id uuid primary key default uuid_generate_v4(),
    ticket_id uuid references tickets(id) on delete cascade not null,
    scanner_id uuid references profiles(id) on delete set null,
    
    scanned_at timestamptz default now(),
    result text not null, -- 'success', 'duplicate', 'invalid'
    meta jsonb default '{}'::jsonb
);

-- 5. Enable RLS on All Tables
alter table profiles enable row level security;
alter table events enable row level security;
alter table tickets enable row level security;
alter table scan_logs enable row level security;

-- 6. Attach Triggers (Idempotent)
drop trigger if exists update_profiles_modtime on profiles;
create trigger update_profiles_modtime before update on profiles for each row execute procedure update_updated_at_column();

drop trigger if exists update_events_modtime on events;
create trigger update_events_modtime before update on events for each row execute procedure update_updated_at_column();

drop trigger if exists update_tickets_modtime on tickets;
create trigger update_tickets_modtime before update on tickets for each row execute procedure update_updated_at_column();
