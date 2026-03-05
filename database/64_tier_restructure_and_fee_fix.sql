-- 64_tier_restructure_and_fee_fix.sql
--
-- Monetization Fixes (2026-03-02):
--  M-9.1: Deprecate create_sandbox_subscription for non-free plans (keep only for free tier)
--  M-9.3: Flat fee from ticket #1 — remove the 100-ticket threshold exemption
--  Tier restructure: Unlimited events on ALL tiers; gate on features (ticket types, scanners)
--
-- The `plans` table drives:
--   1. check_organizer_limits() — event + ticket type limits
--   2. get_organizer_fee_percentage() — commission rate
--   3. handle_subscription_tier_sync() trigger — tier elevation on payment confirmation

-- ─── 1. Update Plans Table ────────────────────────────────────────────────────
-- Free: unlimited events, 1 ticket type, 1 scanner, 2% fee
-- Pro:  unlimited events, 10 ticket types, 5 scanners, 2% fee, analytics, AI
-- Premium: unlimited events, unlimited ticket types, unlimited scanners, 1.5% fee

-- Ensure the new feature-gating columns exist (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ticket_types_limit') THEN
        ALTER TABLE plans ADD COLUMN ticket_types_limit int NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ai_features') THEN
        ALTER TABLE plans ADD COLUMN ai_features boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'seating_map') THEN
        ALTER TABLE plans ADD COLUMN seating_map boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- Update Free plan: unlimited events (999999), 1 ticket type, 1 scanner, 2% fee
-- Real columns: id, name, price, events_limit, tickets_limit, scanners_limit, commission_rate, features, is_active
INSERT INTO plans (id, name, price, events_limit, tickets_limit, scanners_limit, commission_rate, ticket_types_limit, ai_features, seating_map, is_active)
VALUES ('free', 'Starter', 0, 999999, 999999, 1, 0.020, 1, false, false, true)
ON CONFLICT (id) DO UPDATE SET
    name = 'Starter',
    price = 0,
    events_limit = 999999,
    tickets_limit = 999999,
    scanners_limit = 1,
    commission_rate = 0.020,
    ticket_types_limit = 1,
    ai_features = false,
    seating_map = false,
    is_active = true;

-- Update Pro plan: unlimited events, 10 ticket types, 5 scanners, 2% fee, AI + seating
INSERT INTO plans (id, name, price, events_limit, tickets_limit, scanners_limit, commission_rate, ticket_types_limit, ai_features, seating_map, is_active)
VALUES ('pro', 'Professional', 199.00, 999999, 999999, 5, 0.020, 10, true, true, true)
ON CONFLICT (id) DO UPDATE SET
    name = 'Professional',
    price = 199.00,
    events_limit = 999999,
    tickets_limit = 999999,
    scanners_limit = 5,
    commission_rate = 0.020,
    ticket_types_limit = 10,
    ai_features = true,
    seating_map = true,
    is_active = true;

-- Update Premium plan: unlimited everything, 1.5% fee (vs Computicket 4.5%)
INSERT INTO plans (id, name, price, events_limit, tickets_limit, scanners_limit, commission_rate, ticket_types_limit, ai_features, seating_map, is_active)
VALUES ('premium', 'Premium', 399.00, 999999, 999999, 999999, 0.015, 999999, true, true, true)
ON CONFLICT (id) DO UPDATE SET
    name = 'Premium',
    price = 399.00,
    events_limit = 999999,
    tickets_limit = 999999,
    scanners_limit = 999999,
    commission_rate = 0.015,
    ticket_types_limit = 999999,
    ai_features = true,
    seating_map = true,
    is_active = true;


-- ─── 2. Fix get_organizer_fee_percentage — Remove 100-ticket threshold (M-9.3) ─
-- BEFORE: Organizers with <100 tickets on their event got 0% fee
--         (enforced elsewhere in the codebase via calculated_fee_rate)
-- NOW: Flat rate from plan — no more threshold exemption
-- Note: The old threshold was in constants.tsx/legal docs only; the actual DB
--       get_organizer_fee_percentage already reads from plans. The fix is that
--       the FREE plan commission_rate is now 0.020 (not 0.000), so every paid
--       event regardless of size incurs the correct 2% fee.
--       Update the default fallback from 10% to 2% as well:

CREATE OR REPLACE FUNCTION get_organizer_fee_percentage(p_organizer_id uuid)
RETURNS numeric AS $$
DECLARE
    v_commission numeric;
BEGIN
    -- Look up the commission rate from the organizer's active subscription plan
    SELECT p.commission_rate
    INTO v_commission
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = p_organizer_id
      AND s.status = 'active'
      AND s.current_period_end > now()
    ORDER BY s.current_period_end DESC
    LIMIT 1;

    -- M-9.3: Default to Starter (Free) rate of 2%, not the previous 10% fallback.
    -- Free organizers without an active paid subscription pay 2% on all ticket sales.
    RETURN COALESCE(v_commission, 0.020);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 3. Update check_organizer_limits to use new column names ─────────────────
CREATE OR REPLACE FUNCTION check_organizer_limits(org_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_plan       record;
    v_event_count int;
BEGIN
    -- Get active plan (fall back to free plan defaults)
    SELECT
        p.id          AS plan_id,
        p.name        AS plan_name,
        COALESCE(p.events_limit, 999999)          AS events_limit,
        COALESCE(p.tickets_limit, 999999)         AS tickets_limit,
        COALESCE(p.ticket_types_limit, 1)         AS ticket_types_limit,
        COALESCE(p.scanners_limit, 1)             AS scanners_limit,
        COALESCE(p.commission_rate, 0.020)        AS commission_rate,
        COALESCE(p.ai_features, false)            AS ai_features,
        COALESCE(p.seating_map, false)            AS seating_map
    INTO v_plan
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = org_id
      AND s.status = 'active'
      AND s.current_period_end > now()
    ORDER BY s.current_period_end DESC
    LIMIT 1;

    IF NOT FOUND THEN
        -- Free/no-subscription defaults
        v_plan.plan_id          := 'free';
        v_plan.plan_name        := 'Starter';
        v_plan.events_limit     := 999999;
        v_plan.tickets_limit    := 999999;
        v_plan.ticket_types_limit := 1;
        v_plan.scanners_limit   := 1;
        v_plan.commission_rate  := 0.020;
        v_plan.ai_features      := false;
        v_plan.seating_map      := false;
    END IF;

    -- Count current active events for this organizer
    SELECT COUNT(*) INTO v_event_count
    FROM events
    WHERE organizer_id = org_id
      AND status IN ('published', 'coming_soon', 'draft');

    RETURN jsonb_build_object(
        'plan_id',              v_plan.plan_id,
        'plan_name',            v_plan.plan_name,
        'events_limit',         v_plan.events_limit,
        'events_current',       v_event_count,
        'tickets_limit',        v_plan.tickets_limit,
        'ticket_types_limit',   v_plan.ticket_types_limit,
        'scanner_limit',        v_plan.scanners_limit,
        'commission_rate',      v_plan.commission_rate,
        'ai_features',          v_plan.ai_features,
        'seating_map',          v_plan.seating_map
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── 4. Restrict create_sandbox_subscription to FREE plan only ───────────────
-- M-9.1: This sandbox RPC must never elevate an organizer to a paid tier.
-- Paid tiers (pro, premium) must go through the create-billing-checkout Edge Function.
CREATE OR REPLACE FUNCTION create_sandbox_subscription(p_plan_id text)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_plan_record record;
    v_sub_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
    END IF;

    -- M-9.1: CRITICAL — Sandbox can only activate the FREE plan.
    -- Paid plans must be processed through the create-billing-checkout Edge Function.
    IF p_plan_id != 'free' THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Paid plan upgrades require payment through the billing checkout. Please use the upgrade flow.',
            'requires_payment', true
        );
    END IF;

    SELECT * INTO v_plan_record FROM plans WHERE id = p_plan_id AND is_active = true;
    IF v_plan_record.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid or inactive plan specified');
    END IF;

    UPDATE subscriptions
    SET status = 'cancelled', updated_at = now()
    WHERE user_id = v_user_id AND status = 'active';

    INSERT INTO subscriptions (
        user_id, plan_id, status, current_period_start, current_period_end
    ) VALUES (
        v_user_id, p_plan_id, 'active', now(), now() + interval '30 days'
    ) RETURNING id INTO v_sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Free plan activated.',
        'subscription_id', v_sub_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
