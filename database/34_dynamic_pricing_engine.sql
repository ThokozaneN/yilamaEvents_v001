/*
  # Yilama Events: Dynamic Pricing Engine v1.0
  
  Dependencies: 04_events_and_permissions.sql, 05_ticketing_and_scanning.sql

  ## Architecture:
  - `pricing_rules`: Defines auto-adjustment bounds per ticket tier.
  - `price_adjustment_logs`: Immutable audit trail for every automated change.
  - Function `evaluate_dynamic_pricing`: Triggers the logic based on recent sales.
*/

create table if not exists pricing_rules (
    id uuid primary key default uuid_generate_v4(),
    ticket_type_id uuid references ticket_types(id) on delete cascade unique not null,
    
    base_price numeric(10,2) not null check(base_price >= 0),
    min_price numeric(10,2) not null check(min_price >= 0),
    max_price numeric(10,2) not null check(max_price >= min_price),
    
    -- "If we sell more than X tickets in the last H hours, increase price"
    velocity_threshold int not null default 10,
    check_window_hours int not null default 1,
    
    increase_step numeric(10,2) not null default 10.00,
    decrease_step numeric(10,2) not null default 0.00,
    
    -- Freeze logic: Don't change price if event is X% sold out
    freeze_at_capacity_pct numeric(3,2) default 0.90, -- e.g., 0.90 = 90%
    is_active boolean default true,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists price_adjustment_logs (
    id uuid primary key default uuid_generate_v4(),
    ticket_type_id uuid references ticket_types(id) on delete cascade not null,
    rule_id uuid references pricing_rules(id) on delete set null,
    
    old_price numeric(10,2) not null,
    new_price numeric(10,2) not null,
    
    metadata jsonb default '{}'::jsonb, -- Store the velocity/reason here
    created_at timestamptz default now()
);

-- Index for cron job speed
create index idx_pricing_rules_active on pricing_rules(is_active) where is_active = true;


-- The core evaluator function
-- This will be called via pg_cron or a Supabase Edge Worker periodically (e.g., every hour)
create or replace function evaluate_dynamic_pricing()
returns void as $$
declare
    v_rule record;
    v_sold_recent int;
    v_current_price numeric(10,2);
    v_capacity_pct numeric(5,2);
    v_new_price numeric(10,2);
begin
    -- Loop through all active pricing rules
    for v_rule in select pr.*, tt.price as current_price, tt.quantity_sold, tt.quantity_limit 
                  from pricing_rules pr
                  join ticket_types tt on pr.ticket_type_id = tt.id
                  where pr.is_active = true loop
                  
        v_current_price := v_rule.current_price;
        v_capacity_pct := 0;

        -- Check capacity freeze
        if v_rule.quantity_limit > 0 then
            v_capacity_pct := v_rule.quantity_sold::numeric / v_rule.quantity_limit::numeric;
            
            if v_capacity_pct >= v_rule.freeze_at_capacity_pct then
                continue; -- Skip this tier, too close to sold out
            end if;
        end if;

        -- Calculate Sales Velocity
        -- Count tickets created in the last N hours for this tier
        select count(*) into v_sold_recent 
        from tickets 
        where ticket_type_id = v_rule.ticket_type_id
        and created_at >= (now() - (v_rule.check_window_hours || ' hours')::interval);

        v_new_price := v_current_price;

        -- Apply increase logic if demand is high
        if v_sold_recent >= v_rule.velocity_threshold and v_current_price < v_rule.max_price then
            v_new_price := v_current_price + v_rule.increase_step;
            if v_new_price > v_rule.max_price then
                v_new_price := v_rule.max_price;
            end if;
        end if;

        -- Apply decrease logic if demand is completely dead (Optional)
        if v_sold_recent = 0 and v_current_price > v_rule.min_price and v_rule.decrease_step > 0 then
            v_new_price := v_current_price - v_rule.decrease_step;
             if v_new_price < v_rule.min_price then
                v_new_price := v_rule.min_price;
            end if;
        end if;

        -- Apply the change if shifted
        if v_new_price != v_current_price then
            update ticket_types set price = v_new_price, updated_at = now() where id = v_rule.ticket_type_id;
            
            insert into price_adjustment_logs (ticket_type_id, rule_id, old_price, new_price, metadata)
            values (v_rule.ticket_type_id, v_rule.id, v_current_price, v_new_price, jsonb_build_object('tickets_sold_recent', v_sold_recent, 'capacity_pct', v_capacity_pct));
        end if;

    end loop;
end;
$$ language plpgsql security definer;


-- RLS for standard compliance
alter table pricing_rules enable row level security;
alter table price_adjustment_logs enable row level security;

create policy "Organizers manage their pricing rules" on pricing_rules
    for all using (
        exists (
            select 1 from ticket_types tt
            join events e on tt.event_id = e.id
            where tt.id = pricing_rules.ticket_type_id 
            and e.organizer_id = auth.uid()
        )
    );

create policy "Organizers view their price history" on price_adjustment_logs
    for select using (
        exists (
            select 1 from ticket_types tt
            join events e on tt.event_id = e.id
            where tt.id = price_adjustment_logs.ticket_type_id 
            and e.organizer_id = auth.uid()
        )
    );
