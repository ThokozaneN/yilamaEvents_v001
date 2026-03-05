-- 50_billing_payments_and_rpc.sql
--
-- Creates the missing `billing_payments` table used by create-billing-checkout
-- and the `finalize_billing_payment` RPC called by the payfast-itn webhook.
-- The existing `payments` table requires an order_id (for ticket orders), so
-- subscription payments need their own separate ledger table.

-- ─── TABLE ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_payments (
    id               uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          uuid         REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    subscription_id  uuid         REFERENCES subscriptions(id) ON DELETE SET NULL,

    amount           numeric(10,2) NOT NULL CHECK (amount >= 0),
    currency         text          DEFAULT 'ZAR',

    provider_ref     text          UNIQUE NOT NULL, -- PayFast m_payment_id / our UUID
    status           text          NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),

    metadata         jsonb         DEFAULT '{}'::jsonb,

    created_at       timestamptz   DEFAULT now(),
    updated_at       timestamptz   DEFAULT now()
);

-- Index for ITN lookups by provider_ref
CREATE INDEX IF NOT EXISTS idx_billing_payments_provider_ref ON billing_payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_billing_payments_user_id      ON billing_payments(user_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_billing_payments_modtime ON billing_payments;
CREATE TRIGGER update_billing_payments_modtime
    BEFORE UPDATE ON billing_payments
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- RLS
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own billing payments"
    ON billing_payments FOR SELECT
    USING (user_id = auth.uid());

-- ─── RPC ─────────────────────────────────────────────────────────────────────

-- Called by the payfast-itn webhook after PayFast confirms/rejects the payment.
-- It:
--   1. Finds the billing_payment by provider_ref
--   2. Updates the billing_payment status
--   3. If confirmed → activates the subscription (triggers profile tier upgrade via DB trigger)
--   4. If failed    → cancels the subscription

CREATE OR REPLACE FUNCTION finalize_billing_payment(
    p_provider_ref text,
    p_status       text,           -- 'confirmed' | 'failed'
    p_metadata     jsonb DEFAULT '{}'::jsonb
) RETURNS void AS $$
DECLARE
    v_bp billing_payments%ROWTYPE;
BEGIN
    -- 1. Find the billing payment record
    SELECT * INTO v_bp FROM billing_payments WHERE provider_ref = p_provider_ref;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'billing_payment not found for provider_ref: %', p_provider_ref;
    END IF;

    -- Idempotency: already finalised
    IF v_bp.status != 'pending' THEN
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
        -- Activating triggers handle_subscription_tier_sync → upgrades profile.organizer_tier
        -- 4. Record Financial Transaction (debit) for the subscription charge
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
        UPDATE subscriptions
        SET status     = 'cancelled',
            updated_at = now()
        WHERE id = v_bp.subscription_id;
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
