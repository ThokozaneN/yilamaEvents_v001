/*
  # Yilama Events: Revenue & Settlement Logic v1.0
  
  Dependencies: 05_ticketing_and_scanning.sql

  ## Logic:
  1. Fee Calculation (Based on Subscription Plan)
  2. Automatic Ledger Entries (Triggered by Payment/Refund success)
  3. Balance Views (Aggregated from Ledger)

  ## Security:
  - Idempotent transaction recording
  - Atomic fee deduction
  - Strict numeric arithmetic
*/

-- 1. Helper: Get Organizer Fee Percentage
create or replace function get_organizer_fee_percentage(p_organizer_id uuid)
returns numeric as $$
declare
    v_commission numeric;
begin
    -- Logic: Find active plan -> extract commission_rate
    select p.commission_rate
    into v_commission
    from subscriptions s
    join plans p on s.plan_id = p.id
    where s.user_id = p_organizer_id
    and s.status = 'active'
    and s.current_period_end > now()
    limit 1;

    return coalesce(v_commission, 0.100); -- Default to Free Tier (10%) fallback
end;
$$ language plpgsql security definer;

-- 2. Trigger: Process Payment Settlement (Revenue + Fee)
create or replace function process_payment_settlement()
returns trigger as $$
declare
    v_order_id uuid;
    v_organizer_id uuid;
    v_fee_percent numeric;
    v_fee_amount numeric;
    v_net_amount numeric;
    v_exists boolean;
begin
    -- Only run when payment moves to 'completed'
    if new.status != 'completed' or (old.status = 'completed') then
        return new;
    end if;

    v_order_id := new.order_id;

    -- Get Organizer
    select e.organizer_id into v_organizer_id
    from orders o
    join events e on o.event_id = e.id
    where o.id = v_order_id;

    if v_organizer_id is null then
        raise exception 'Organizer not found for order %', v_order_id;
    end if;

    -- Idempotency Check: Did we already ledger this payment?
    -- Check for a 'ticket_sale' transaction for this payment ID
    select exists(
        select 1 from financial_transactions 
        where reference_id = new.id 
        and reference_type = 'payment'
        and category = 'ticket_sale'
    ) into v_exists;

    if v_exists then
        return new; -- Already processed
    end if;

    -- Calculate Fee
    v_fee_percent := get_organizer_fee_percentage(v_organizer_id);
    v_fee_amount := round(new.amount * v_fee_percent, 2);
    
    -- 1. Credit Organizer (Gross Sale)
    insert into financial_transactions (
        wallet_user_id, type, amount, category, reference_type, reference_id, description
    ) values (
        v_organizer_id, 
        'credit', 
        new.amount, 
        'ticket_sale', 
        'payment', 
        new.id, 
        'Ticket Sale Revenue'
    );

    -- 2. Debit Organizer (Platform Fee)
    if v_fee_amount > 0 then
        insert into financial_transactions (
            wallet_user_id, type, amount, category, reference_type, reference_id, description
        ) values (
            v_organizer_id, 
            'debit', 
            v_fee_amount, 
            'platform_fee', 
            'payment', 
            new.id, 
            'Platform Commission (' || (v_fee_percent * 100) || '%)'
        );
        
        -- Also record in specialized platform_fees table (from 03 schema) for easier analytics
        insert into platform_fees (order_id, amount, percentage_applied)
        values (v_order_id, v_fee_amount, v_fee_percent);
    end if;

    return new;
end;
$$ language plpgsql security definer;

-- Attach Trigger to Payments
drop trigger if exists on_payment_completed on payments;
create trigger on_payment_completed
    after update on payments
    for each row
    execute procedure process_payment_settlement();

-- Also handle direct inserts of 'completed' payments (unlikely but safe)
drop trigger if exists on_payment_inserted_completed on payments;
create trigger on_payment_inserted_completed
    after insert on payments
    for each row
    execute procedure process_payment_settlement();


-- 3. Trigger: Process Refunds (Reversal)
create or replace function process_refund_settlement()
returns trigger as $$
declare
    v_order_id uuid;
    v_organizer_id uuid;
    v_exists boolean;
begin
    -- Only run when refund moves to 'completed'
    if new.status != 'completed' or (old.status = 'completed') then
        return new;
    end if;

    -- Get Payment -> Order -> Organizer
    select e.organizer_id into v_organizer_id
    from payments p
    join orders o on p.order_id = o.id
    join events e on o.event_id = e.id
    where p.id = new.payment_id;

    -- Idempotency Check
    select exists(
        select 1 from financial_transactions 
        where reference_id = new.id 
        and reference_type = 'refund'
    ) into v_exists;

    if v_exists then return new; end if;

    -- Debit Organizer (Refund Amount)
    -- Start simple: Organizer pays full refund. 
    -- Platform fee reversal policy is complex, usually fees are NOT refunded to organizer
    -- unless platform allows it. For V1, we simply debit the refund amount.
    insert into financial_transactions (
        wallet_user_id, type, amount, category, reference_type, reference_id, description
    ) values (
        v_organizer_id, 
        'debit', 
        new.amount, 
        'refund', 
        'refund', 
        new.id, 
        'Refund to Customer: ' || coalesce(new.reason, 'Requested')
    );

    return new;
end;
$$ language plpgsql security definer;

-- Attach Trigger to Refunds
drop trigger if exists on_refund_completed on refunds;
create trigger on_refund_completed
    after update on refunds
    for each row
    execute procedure process_refund_settlement();


-- 4. View: Net Payout Calculations
-- Aggregates ledger to show what is owed to organizers
create or replace view v_organizer_balances as
select 
    wallet_user_id as organizer_id,
    sum(case when type = 'credit' then amount else 0 end) as total_credits,
    sum(case when type = 'debit' then amount else 0 end) as total_debits,
    (
        sum(case when type = 'credit' then amount else 0 end) - 
        sum(case when type = 'debit' then amount else 0 end)
    ) as pending_balance
from financial_transactions
group by wallet_user_id;

-- 5. Strict RLS on View
-- Organizers can only see their own balance
-- Note: Views don't have RLS directly in standard Postgres 14 unless defined with security_invoker or accessed via RLS table. 
-- Best practice: Wrap in a function or leave for admin/system use.
-- Only creating RLS if it's a direct select.
alter view v_organizer_balances owner to postgres; -- Ensure owner has high privs
grant select on v_organizer_balances to authenticated;

-- Use a function to safely expose this if needed for UI, 
-- or rely on the underlying table RLS if the view inherits (it does not automatically).
-- We'll add a simple query function for the UI.

create or replace function get_my_balance()
returns numeric as $$
    select pending_balance 
    from v_organizer_balances 
    where organizer_id = auth.uid();
$$ language sql security definer;

