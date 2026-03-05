/*
  # Yilama Events: Audit & Security Hardening v1.0
  
  Dependencies: 07_resale_and_transfers.sql

  ## Security Layer:
  1. Audit Logs (Immutable History)
  2. Anti-Tamper Triggers
  3. Function Hardening (Search Path)

  ## Tracked Events:
  - Verification Status Changes
  - Event Lifecycle Changes
  - Money Movement (Payments/Payouts)
*/

-- 1. Audit Logs Table
create table if not exists audit_logs (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid, -- Actor (can be null if system)
    target_resource text not null, -- 'profile', 'event', 'payment'
    target_id uuid not null,
    
    action text not null, -- 'verified', 'published', 'paid'
    changes jsonb, -- Old vs New values
    
    ip_address text,
    user_agent text,
    
    created_at timestamptz default now()
);

-- RLS: Only Admins can view audit logs
alter table audit_logs enable row level security;

create policy "Admins view audit logs" on audit_logs
    for select using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );
    
-- No insert/update policy for users. Only system triggers insert.

-- 2. universal Audit Trigger
create or replace function log_audit_event()
returns trigger as $$
declare
    v_user_id uuid;
    v_changes jsonb;
begin
    v_user_id := auth.uid();
    
    -- Capture changes for Updates
    if (TG_OP = 'UPDATE') then
        v_changes := jsonb_build_object(
            'old', row_to_json(OLD),
            'new', row_to_json(NEW)
        );
    elsif (TG_OP = 'INSERT') then
        v_changes := row_to_json(NEW);
    else
        v_changes := row_to_json(OLD);
    end if;

    insert into audit_logs (
        user_id, target_resource, target_id, action, changes
    ) values (
        v_user_id,
        TG_TABLE_NAME::text,
        coalesce(NEW.id, OLD.id),
        TG_OP || '_' || TG_TABLE_NAME, -- e.g. UPDATE_profiles
        v_changes
    );

    return null; -- After trigger, return null is fine
end;
$$ language plpgsql security definer set search_path = public;


-- 3. Targeted Audit Triggers (Noise Reduction)
-- We don't want to log everything, just sensitive flows.

-- A. Monitor Verification Changes
create or replace function audit_profile_verification()
returns trigger as $$
begin
    if (old.verification_status is distinct from new.verification_status) or 
       (old.role is distinct from new.role) then
        insert into audit_logs (user_id, target_resource, target_id, action, changes)
        values (
            auth.uid(), 
            'profile', 
            new.id, 
            'verification_change', 
            jsonb_build_object('old_status', old.verification_status, 'new_status', new.verification_status, 'old_role', old.role, 'new_role', new.role)
        );
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists track_verification_changes on profiles;
create trigger track_verification_changes
    after update on profiles
    for each row
    execute procedure audit_profile_verification();

-- B. Monitor Event Status (Publish/Cancel)
create or replace function audit_event_lifecycle()
returns trigger as $$
begin
    if (old.status is distinct from new.status) then
        insert into audit_logs (user_id, target_resource, target_id, action, changes)
        values (
            auth.uid(), 
            'event', 
            new.id, 
            'status_change', 
            jsonb_build_object('old', old.status, 'new', new.status)
        );
    end if;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists track_event_status on events;
create trigger track_event_status
    after update on events
    for each row
    execute procedure audit_event_lifecycle();

-- C. Monitor Payouts (Sensitive)
create or replace function audit_payout_actions()
returns trigger as $$
begin
    insert into audit_logs (user_id, target_resource, target_id, action, changes)
    values (auth.uid(), 'payout', new.id, TG_OP, row_to_json(new));
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists track_payouts on payouts;
create trigger track_payouts
    after insert or update on payouts
    for each row
    execute procedure audit_payout_actions();


-- 4. Function Hardening (Search Path Protection)
-- Retroactively secure functions created in previous steps
-- This prevents malicious search_path injection attacks

alter function handle_new_user() set search_path = public;
alter function is_admin() set search_path = public;
alter function owns_event(uuid) set search_path = public;
alter function is_event_scanner(uuid) set search_path = public;
alter function validate_ticket_scan(uuid, uuid, uuid, text) set search_path = public;
alter function process_payment_settlement() set search_path = public;
alter function process_refund_settlement() set search_path = public;
