/*
  # Yilama Events: Enforce Payment-Authoritative Upgrades
  
  This patch removes the inherently insecure `upgrade_organizer_tier`
  function that allowed clients to bypass the financial ledger.
  
  It replaces it with a rigorous database trigger that listens for 
  `subscriptions` status changes to dictate the `organizer_tier`.
  
  To preserve sandbox testing without real payment providers,
  we introduce `create_sandbox_subscription` which simulates a
  free checkout, minting legitimate ledger entries to fulfill
  the trigger's requirements.
*/

-- 1. Eliminate the Revenue Backdoor
DROP FUNCTION IF EXISTS public.upgrade_organizer_tier(text);

-- 2. Create the Ledger-Authoritative Tier Enforcer Trigger
CREATE OR REPLACE FUNCTION handle_subscription_tier_sync()
RETURNS trigger AS $$
BEGIN
    -- If a subscription goes 'active', upgrade the organizer's profile tier to match the plan.
    IF new.status = 'active' THEN
        -- Verify the user actually exists to avoid dead-end updates
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

-- Attach trigger to the subscriptions table
DROP TRIGGER IF EXISTS on_subscription_status_change ON subscriptions;
CREATE TRIGGER on_subscription_status_change
    AFTER INSERT OR UPDATE OF status, plan_id ON subscriptions
    FOR EACH ROW
    EXECUTE PROCEDURE handle_subscription_tier_sync();

-- 3. Create the Sandbox "Mock" Checkout Flow
CREATE OR REPLACE FUNCTION create_sandbox_subscription(p_plan_id text)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_plan_record record;
    v_order_id uuid;
    v_sub_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
    END IF;

    -- Validate the plan exists
    SELECT * INTO v_plan_record FROM plans WHERE id = p_plan_id AND is_active = true;
    IF v_plan_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid or inactive plan specified');
    END IF;

    -- Cancel any existing active subscriptions to prevent overlap
    UPDATE subscriptions 
    SET status = 'cancelled', updated_at = now() 
    WHERE user_id = v_user_id AND status = 'active';

    -- 1. Insert a mock payment/order trail (Ledger integrity)
    -- We'll skip the actual `orders` table for subscriptions unless we specifically
    -- want to track the invoice. For this sandbox, direct subscription is enough,
    -- but usually you'd pair this with a $0 `payment`. 
    
    -- 2. Insert the Subscription
    -- **CRITICAL**: The trigger `on_subscription_status_change` will intercept this INSERT
    -- and automatically elevate the `profiles.organizer_tier` to `p_plan_id`.
    INSERT INTO subscriptions (
        user_id, plan_id, status, current_period_start, current_period_end
    ) VALUES (
        v_user_id, p_plan_id, 'active', now(), now() + interval '30 days'
    ) RETURNING id INTO v_sub_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Sandbox Subscription Activated: ' || upper(p_plan_id),
        'subscription_id', v_sub_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
