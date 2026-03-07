-- 93_payfast_subscription_hardening.sql
--
-- 1. Add subscription token column to store PayFast references
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS processor_subscription_token text;

-- 2. Update Plan Prices to match the UI and Business Requirements
-- Pro: R79.00/month, Premium: R119.00/month
UPDATE plans SET price = 79.00 WHERE id = 'pro';
UPDATE plans SET price = 119.00 WHERE id = 'premium';

-- 3. Update finalize_billing_payment to handle tokens and recurring payments
CREATE OR REPLACE FUNCTION finalize_billing_payment(
    p_provider_ref text,
    p_status       text,           -- 'confirmed' | 'failed'
    p_metadata     jsonb DEFAULT '{}'::jsonb,
    p_token        text DEFAULT NULL -- Subscription Token from PayFast
) RETURNS void AS $$
DECLARE
    v_bp billing_payments%ROWTYPE;
    v_sub_id uuid;
BEGIN
    -- 1. Find the billing payment record
    SELECT * INTO v_bp FROM billing_payments WHERE provider_ref = p_provider_ref;
    
    -- If not found, check if this is a recurring ITN by token
    IF NOT FOUND AND p_token IS NOT NULL THEN
        SELECT id INTO v_sub_id FROM subscriptions WHERE processor_subscription_token = p_token;
        
        -- If we find a subscription by token, create a synthetic billing_payment record
        -- so the rest of the logic works (and we have a ledger entry)
        IF v_sub_id IS NOT NULL THEN
            INSERT INTO billing_payments (user_id, subscription_id, amount, provider_ref, status, metadata)
            SELECT user_id, id, (SELECT price FROM plans WHERE id = plan_id), p_provider_ref, 'pending', p_metadata
            FROM subscriptions WHERE id = v_sub_id
            RETURNING * INTO v_bp;
        END IF;
    END IF;

    IF v_bp.id IS NULL THEN
        RAISE EXCEPTION 'billing_payment not found and no subscription matches token: %', p_token;
    END IF;

    -- Idempotency: already finalised
    IF v_bp.status = 'confirmed' AND p_status = 'confirmed' THEN
        RETURN;
    END IF;

    -- 2. Update billing_payment
    UPDATE billing_payments
    SET status     = p_status,
        metadata   = metadata || p_metadata,
        updated_at = now()
    WHERE id = v_bp.id;

    -- 3. Activate / cancel the subscription
    IF p_status = 'confirmed' AND v_bp.subscription_id IS NOT NULL THEN
        -- Store the token if provided
        IF p_token IS NOT NULL THEN
            UPDATE subscriptions SET processor_subscription_token = p_token WHERE id = v_bp.subscription_id;
        END IF;

        -- Record Financial Transaction (debit) for the subscription charge
        INSERT INTO financial_transactions (
            wallet_user_id,
            type,
            amount,
            category,
            reference_type,
            reference_id,
            description
        ) VALUES (
            v_bp.user_id,
            'debit',
            v_bp.amount,
            'subscription_charge',
            'subscription',
            v_bp.subscription_id,
            'Subscription Charge: ' || (SELECT name FROM plans WHERE id = (SELECT plan_id FROM subscriptions WHERE id = v_bp.subscription_id))
        );

        UPDATE subscriptions
        SET status     = 'active',
            updated_at = now()
        WHERE id = v_bp.subscription_id;

    ELSIF p_status = 'failed' AND v_bp.subscription_id IS NOT NULL THEN
        -- We only cancel if it was already pending. If it was active, maybe it's a failed renewal?
        -- For now, keep it simple: failure during checkout/renewal cancels or flags the sub.
        UPDATE subscriptions
        SET status     = 'cancelled',
            updated_at = now()
        WHERE id = v_bp.subscription_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
