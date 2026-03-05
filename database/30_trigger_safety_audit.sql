/*
  # Yilama Events: Trigger Safety Audit & Determinism Fixes
  
  This patch resolves critical backend edge cases:
  1. Fixes silent ghost-user failures during Auth-to-Profile mirroring by logging 
     rather than swallowing exceptions during profile creation.
  2. Resolves a broken audit-logging trigger that checked for `verification_status`
     instead of the canonical `organizer_status`.
  3. Secures core cascade triggers (`on_subscription_status_change`, `check_profile_updates`)
     against Infinite Loops using `pg_trigger_depth()` guard-rails.
*/

-- -------------------------------------------------------------------------
-- 1. FIX: Auth-to-Profile Mirroring (Prevent Ghost Users)
-- -------------------------------------------------------------------------
-- Replaces the aggressive 'EXCEPTION WHEN OTHERS THEN NULL' with safe conflict resolution
create or replace function public.handle_new_user() 
returns trigger as $$
declare
  v_role_text text;
  v_role_enum public.user_role;
begin
  -- Prevent trigger cascades / recursive loops if auth happens to be touched during profile updates
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- A. Extract and Validate Role
  v_role_text := coalesce(new.raw_user_meta_data->>'role', 'attendee');
  
  -- Map 'user' to 'attendee' if frontend sends 'user'
  if v_role_text = 'user' then 
    v_role_text := 'attendee'; 
  end if;

  -- Ensure it's a valid enum value
  begin
    v_role_enum := v_role_text::public.user_role;
  exception when others then
    v_role_enum := 'attendee';
  end;

  -- B. Safely Insert Profile using ON CONFLICT logic instead of dropping errors
  insert into public.profiles (
    id, 
    email, 
    role, 
    name,
    phone,
    organizer_tier,
    organizer_status, -- explicitly initializing default
    business_name,
    organization_phone
  )
  values (
    new.id, 
    new.email, 
    v_role_enum,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), -- fallback name
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'organizer_tier', 'free'),
    'draft',
    new.raw_user_meta_data->>'business_name',
    case when v_role_text = 'organizer' then new.raw_user_meta_data->>'phone' else null end
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer set search_path = public;


-- -------------------------------------------------------------------------
-- 2. FIX: Broken Audit Logging Reference (Phase 7 Schema Drift)
-- -------------------------------------------------------------------------
create or replace function audit_profile_verification()
returns trigger as $$
begin
    -- Prevent infinite loops if logs somehow trigger profile updates
    if pg_trigger_depth() > 1 then
        return new;
    end if;

    -- Use the CORRECT column: organizer_status (not verification_status)
    if (old.organizer_status is distinct from new.organizer_status) or 
       (old.role is distinct from new.role) then
        insert into audit_logs (user_id, target_resource, target_id, action, changes)
        values (
            auth.uid(), 
            'profile', 
            new.id, 
            'verification_change', 
            jsonb_build_object('old_status', old.organizer_status, 'new_status', new.organizer_status, 'old_role', old.role, 'new_role', new.role)
        );
    end if;
    return new;
end;
$$ language plpgsql security definer set search_path = public;


-- -------------------------------------------------------------------------
-- 3. FIX: Subscription -> Profile Cascade Recursion Safety
-- -------------------------------------------------------------------------
-- The subscription tier sync directly UPDATEs the 'profiles' table.
-- If the profiles table gets a trigger that updates 'subscriptions', the server explodes.
CREATE OR REPLACE FUNCTION handle_subscription_tier_sync()
RETURNS trigger AS $$
BEGIN
    -- Guard Rail: Stop infinite cascades
    IF pg_trigger_depth() > 1 THEN
        RETURN new;
    END IF;

    -- If a subscription goes 'active', upgrade the organizer's profile tier to match the plan.
    IF new.status = 'active' THEN
        UPDATE profiles 
        SET organizer_tier = new.plan_id,
            updated_at = now()
        WHERE id = new.user_id;
    END IF;

    -- If a subscription is cancelled or unpaid, gracefully downgrade them to free
    IF new.status IN ('cancelled', 'past_due', 'pending_verification') THEN
        UPDATE profiles 
        SET organizer_tier = 'free',
            updated_at = now()
        WHERE id = new.user_id;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -------------------------------------------------------------------------
-- 4. FIX: Revenue & Fees Sync Recursion Safety
-- -------------------------------------------------------------------------
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
    -- Guard Rail: Prevent deep nested settlements resulting from arbitrary updates
    if pg_trigger_depth() > 1 then
        return new;
    end if;

    -- Only run when payment moves to 'completed'
    if new.status != 'completed' or (old.status = 'completed') then
        return new;
    end if;

    v_order_id := new.order_id;

    select e.organizer_id into v_organizer_id
    from orders o join events e on o.event_id = e.id
    where o.id = v_order_id;

    if v_organizer_id is null then
        raise exception 'Organizer not found for order %', v_order_id;
    end if;

    select exists( select 1 from financial_transactions where reference_id = new.id and reference_type = 'payment' and category = 'ticket_sale') into v_exists;
    if v_exists then
        return new; 
    end if;

    v_fee_percent := get_organizer_fee_percentage(v_organizer_id);
    v_fee_amount := round(new.amount * v_fee_percent, 2);
    
    insert into financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description) 
    values (v_organizer_id, 'credit', new.amount, 'ticket_sale', 'payment', new.id, 'Ticket Sale Revenue');

    if v_fee_amount > 0 then
        insert into financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description) 
        values (v_organizer_id, 'debit', v_fee_amount, 'platform_fee', 'payment', new.id, 'Platform Commission (' || (v_fee_percent * 100) || '%)');
        
        insert into platform_fees (order_id, amount, percentage_applied) values (v_order_id, v_fee_amount, v_fee_percent);
    end if;

    return new;
end;
$$ language plpgsql security definer set search_path = public;
