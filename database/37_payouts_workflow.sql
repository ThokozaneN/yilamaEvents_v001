/*
  # Yilama Events: Payouts Workflow v1.0
  
  Dependencies: 03_financial_architecture.sql

  ## Architecture:
  - Create secure views to calculate available balance.
  - Create strict RPC for requesting payouts.
*/

-- 1. Secure Balance Calculation View
-- This prevents negative balances by subtracting pending payouts/refunds from settled revenue.
create or replace view v_organizer_balance as
select 
    w.wallet_user_id as organizer_id,
    
    -- Sum of all settled credits (ticket sales, positive adjustments)
    coalesce(sum(case when w.type = 'credit' then w.amount else 0 end), 0) as total_credits,
    
    -- Sum of all settled debits (fees, processed refunds, completed payouts)
    coalesce(sum(case when w.type = 'debit' then w.amount else 0 end), 0) as total_debits,
    
    -- The core ledger running balance (Settled)
    coalesce(sum(case when w.type = 'credit' then w.amount else -w.amount end), 0) as settled_balance,
    
    -- Deduct 'pending' or 'processing' payouts that haven't hit the ledger as a debit yet,
    -- or if they HAVE hit the ledger but we want to display pending amounts separately.
    -- Assuming a payout hits the ledger as a 'debit' IMMEDIATELY upon request to lock funds.
    (
        select coalesce(sum(amount), 0) 
        from payouts p 
        where p.organizer_id = w.wallet_user_id 
        and p.status in ('pending', 'processing')
    ) as pending_payout_amount,

    -- Available to withdraw (If we lock funds immediately via debit, this is just settled_balance)
    -- If we don't lock immediately, it's: settled_balance - pending_payout_amount
    -- Let's assume we DO lock immediately for safety.
    coalesce(sum(case when w.type = 'credit' then w.amount else -w.amount end), 0) as available_balance

from financial_transactions w
group by w.wallet_user_id;


-- 2. Request Payout RPC
-- Safely requests a settlement, ensuring funds exist and locking them.
create or replace function request_payout(
    p_amount numeric(10,2)
) returns jsonb as $$
declare
    v_available numeric(10,2);
    v_payout_id uuid;
begin
    -- 1. Validate Amount
    if p_amount <= 0 then
        return jsonb_build_object('success', false, 'message', 'Amount must be greater than zero.');
    end if;

    -- 2. Check Balance
    select available_balance into v_available 
    from v_organizer_balance 
    where organizer_id = auth.uid();
    
    if v_available is null or v_available < p_amount then
        return jsonb_build_object('success', false, 'message', 'Insufficient funds available.', 'requested', p_amount, 'available', coalesce(v_available, 0));
    end if;

    -- 3. Create Payout Record
    insert into payouts (
        organizer_id,
        amount,
        status,
        expected_payout_date
    ) values (
        auth.uid(),
        p_amount,
        'pending',
        now() + interval '3 days' -- Default settlement delay
    ) returning id into v_payout_id;

    -- 4. Lock Funds in Ledger immediately
    insert into financial_transactions (
        wallet_user_id,
        type,
        amount,
        category,
        reference_type,
        reference_id,
        description
    ) values (
        auth.uid(),
        'debit',
        p_amount,
        'payout',
        'payout',
        v_payout_id,
        'Payout Request (Pending)'
    );

    return jsonb_build_object('success', true, 'message', 'Payout requested successfully.', 'payout_id', v_payout_id);
end;
$$ language plpgsql security definer;
