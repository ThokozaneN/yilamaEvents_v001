/*
  # Yilama Events: Refunds & Disputes v1.0
  
  Dependencies: 03_financial_architecture.sql, 04_events_and_permissions.sql

  ## Architecture:
  - Extend `refunds` table with complete status enums if needed.
  - Create `disputes` table for chargebacks.
*/

-- 1. Updates to Refunds Table (Extending from 03_financial)
do $$ begin
    -- Ensure status column constraints are robust
    alter table refunds drop constraint if exists refunds_status_check;
    alter table refunds add constraint refunds_status_check check (status in ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed'));
exception
    when others then null;
end $$;

-- 2. Create Disputes Table
create table if not exists disputes (
    id uuid primary key default uuid_generate_v4(),
    payment_id uuid references payments(id) on delete cascade not null,
    order_id uuid references orders(id) on delete cascade not null,
    
    amount numeric(10,2) not null check (amount > 0),
    currency text default 'ZAR',
    
    reason text not null, -- 'fraudulent', 'unrecognized', 'duplicate', 'product_not_received'
    status text default 'needs_response' check (status in ('needs_response', 'under_review', 'won', 'lost')),
    
    evidence_url text, -- Link to uploaded proof
    evidence_due_by timestamptz,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Note: Financial adjustments for disputes usually happen at the gateway level.
-- When a dispute is 'lost', we must insert a debit into financial_transactions for the organizer.

-- 3. Triggers & RLS
create trigger update_disputes_modtime before update on disputes for each row execute procedure update_updated_at_column();

alter table disputes enable row level security;

-- Organizers can see disputes related to their events
create policy "Organizers view their disputes" on disputes
    for select using (
        exists (
            select 1 from orders o
            join events e on o.event_id = e.id
            where o.id = disputes.order_id
            and e.organizer_id = auth.uid()
        )
    );
