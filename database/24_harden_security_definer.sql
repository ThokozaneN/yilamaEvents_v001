/*
  # Yilama Events: Security Definer Hardening Patch
  
  This patch retroactively hardens all PostgreSQL functions that use
  `SECURITY DEFINER` by explicitly setting `search_path = public`.
  This prevents search path hijacking vectors where malicious users
  could create temporary objects masking core schema targets.

  No business logic is changed. Only the function signatures are updated.
*/

-- 1. Profiles & Auth (from 02_auth_and_profiles.sql, 11_enhanced_auth_trigger.sql)

CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
DECLARE
  v_role text;
  v_phone text;
  v_tier text;
  v_business_name text;
BEGIN
  v_role := coalesce(new.raw_user_meta_data->>'role', 'attendee');
  v_phone := new.raw_user_meta_data->>'phone';
  v_tier := coalesce(new.raw_user_meta_data->>'organizer_tier', 'free');
  v_business_name := new.raw_user_meta_data->>'business_name';

  IF v_role NOT IN ('attendee', 'organizer') THEN
    v_role := 'attendee';
  END IF;

  INSERT INTO public.profiles (
    id, email, role, name, phone, organizer_tier, business_name, organization_phone
  )
  VALUES (
    new.id, new.email, v_role,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_phone, v_tier, v_business_name,
    CASE WHEN v_role = 'organizer' THEN v_phone ELSE NULL END
  );
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The is_admin() function also needs hardening (from 02)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Events & Permissions (from 04_events_and_permissions.sql)

CREATE OR REPLACE FUNCTION owns_event(f_event_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM events
    WHERE id = f_event_id
    AND organizer_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_event_scanner(f_event_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM event_scanners
    WHERE event_id = f_event_id
    AND user_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_event_team_member(f_event_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM event_team_members
    WHERE event_id = f_event_id
    AND user_id = auth.uid()
    AND accepted_at IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Ticketing & Scanning (from 05_ticketing_and_scanning.sql)

CREATE OR REPLACE FUNCTION validate_ticket_scan(
    p_ticket_public_id uuid,
    p_event_id uuid,
    p_scanner_id uuid,
    p_signature text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_ticket_id uuid;
    v_current_status text;
    v_event_match boolean;
    v_already_checked_in boolean;
    v_ticket_data record;
BEGIN
    SELECT t.id, t.status, t.event_id, t.ticket_type_id, tt.name AS tier_name, p.name AS owner_name
    INTO v_ticket_data
    FROM tickets t
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    LEFT JOIN profiles p ON t.owner_user_id = p.id
    WHERE t.public_id = p_ticket_public_id;

    IF v_ticket_data.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ticket not found', 'code', 'NOT_FOUND');
    END IF;

    IF v_ticket_data.event_id != p_event_id THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_event');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM ticket_checkins 
        WHERE ticket_id = v_ticket_data.id 
        AND result = 'success'
    ) INTO v_already_checked_in;

    IF v_already_checked_in THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'duplicate');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket already used', 'code', 'DUPLICATE', 'ticket', row_to_json(v_ticket_data));
    END IF;

    IF v_ticket_data.status != 'valid' THEN
         INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'invalid_status');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    END IF;

    INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, result) 
    VALUES (v_ticket_data.id, p_scanner_id, p_event_id, 'success');

    UPDATE tickets SET status = 'used', updated_at = now() WHERE id = v_ticket_data.id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Valid Ticket', 
        'code', 'SUCCESS', 
        'ticket', jsonb_build_object(
            'tier', v_ticket_data.tier_name,
            'owner', v_ticket_data.owner_name
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Revenue & Settlements (from 06_revenue_and_settlements.sql)

CREATE OR REPLACE FUNCTION get_organizer_fee_percentage(p_organizer_id uuid)
RETURNS numeric AS $$
DECLARE
    v_commission numeric;
BEGIN
    SELECT p.commission_rate
    INTO v_commission
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.user_id = p_organizer_id
    AND s.status = 'active'
    AND s.current_period_end > now()
    LIMIT 1;

    RETURN coalesce(v_commission, 0.100); 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION process_payment_settlement()
RETURNS trigger AS $$
DECLARE
    v_order_id uuid;
    v_organizer_id uuid;
    v_fee_percent numeric;
    v_fee_amount numeric;
    v_net_amount numeric;
    v_exists boolean;
BEGIN
    IF new.status != 'completed' OR (old.status = 'completed') THEN
        RETURN new;
    END IF;

    v_order_id := new.order_id;

    SELECT e.organizer_id INTO v_organizer_id
    FROM orders o
    JOIN events e ON o.event_id = e.id
    WHERE o.id = v_order_id;

    IF v_organizer_id IS NULL THEN
        RAISE EXCEPTION 'Organizer not found for order %', v_order_id;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM financial_transactions 
        WHERE reference_id = new.id 
        AND reference_type = 'payment'
        AND category = 'ticket_sale'
    ) INTO v_exists;

    IF v_exists THEN
        RETURN new; 
    END IF;

    v_fee_percent := get_organizer_fee_percentage(v_organizer_id);
    v_fee_amount := round(new.amount * v_fee_percent, 2);
    
    INSERT INTO financial_transactions (
        wallet_user_id, type, amount, category, reference_type, reference_id, description
    ) VALUES (
        v_organizer_id, 'credit', new.amount, 'ticket_sale', 'payment', new.id, 'Ticket Sale Revenue'
    );

    IF v_fee_amount > 0 THEN
        INSERT INTO financial_transactions (
            wallet_user_id, type, amount, category, reference_type, reference_id, description
        ) VALUES (
            v_organizer_id, 'debit', v_fee_amount, 'platform_fee', 'payment', new.id, 'Platform Commission (' || (v_fee_percent * 100) || '%)'
        );
        
        INSERT INTO platform_fees (order_id, amount, percentage_applied)
        VALUES (v_order_id, v_fee_amount, v_fee_percent);
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION process_refund_settlement()
RETURNS trigger AS $$
DECLARE
    v_order_id uuid;
    v_organizer_id uuid;
    v_exists boolean;
BEGIN
    IF new.status != 'completed' OR (old.status = 'completed') THEN
        RETURN new;
    END IF;

    SELECT e.organizer_id INTO v_organizer_id
    FROM payments p
    JOIN orders o ON p.order_id = o.id
    JOIN events e ON o.event_id = e.id
    WHERE p.id = new.payment_id;

    SELECT EXISTS(
        SELECT 1 FROM financial_transactions 
        WHERE reference_id = new.id 
        AND reference_type = 'refund'
    ) INTO v_exists;

    IF v_exists THEN RETURN new; END IF;

    INSERT INTO financial_transactions (
        wallet_user_id, type, amount, category, reference_type, reference_id, description
    ) VALUES (
        v_organizer_id, 'debit', new.amount, 'refund', 'refund', new.id, 'Refund to Customer: ' || coalesce(new.reason, 'Requested')
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_my_balance()
RETURNS numeric AS $$
    SELECT pending_balance 
    FROM v_organizer_balances 
    WHERE organizer_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;


-- 5. Audit & Hardening (from 08_audit_and_hardening.sql)

CREATE OR REPLACE FUNCTION audit_profile_verification()
RETURNS trigger AS $$
BEGIN
    IF (old.verification_status IS DISTINCT FROM new.verification_status) OR 
       (old.role IS DISTINCT FROM new.role) THEN
        INSERT INTO audit_logs (user_id, target_resource, target_id, action, changes)
        VALUES (
            auth.uid(), 'profile', new.id, 'verification_change', 
            jsonb_build_object('old_status', old.verification_status, 'new_status', new.verification_status, 'old_role', old.role, 'new_role', new.role)
        );
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION audit_event_lifecycle()
RETURNS trigger AS $$
BEGIN
    IF (old.status IS DISTINCT FROM new.status) THEN
        INSERT INTO audit_logs (user_id, target_resource, target_id, action, changes)
        VALUES (
            auth.uid(), 'event', new.id, 'status_change', 
            jsonb_build_object('old', old.status, 'new', new.status)
        );
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION audit_payout_actions()
RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_logs (user_id, target_resource, target_id, action, changes)
    VALUES (auth.uid(), 'payout', new.id, TG_OP, row_to_json(new));
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 6. Tier Enforcement (from 15_tier_enforcement.sql)

CREATE OR REPLACE FUNCTION public.get_organizer_plan(p_user_id uuid)
RETURNS SETOF public.plans AS $$
BEGIN
  RETURN QUERY
  SELECT p.*
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
  AND s.status = 'active'
  AND s.current_period_end > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM public.plans WHERE id = 'free';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_organizer_limits(org_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_plan record;
  v_current_events int;
BEGIN
  SELECT * INTO v_plan FROM public.get_organizer_plan(org_id);
  
  SELECT count(*) INTO v_current_events 
  FROM public.events 
  WHERE organizer_id = org_id 
  AND status NOT IN ('ended', 'cancelled');

  RETURN jsonb_build_object(
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'events_limit', v_plan.events_limit,
    'events_current', v_current_events,
    'tickets_limit', v_plan.tickets_limit,
    'scanners_limit', v_plan.scanners_limit,
    'commission_rate', v_plan.commission_rate
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 7. Webhook & Verifications (from 21_fix_verification_status_naming.sql)

CREATE OR REPLACE FUNCTION trigger_notify_verification_result()
RETURNS trigger AS $$
DECLARE
    v_email text;
    v_url text := 'https://bvjcvdnfoqmxzdflqsdp.supabase.co/functions/v1/notify-verification-result';
    v_anon_key text := current_setting('app.settings.anon_key', true);
BEGIN
    IF old.organizer_status IS DISTINCT FROM new.organizer_status 
       AND new.organizer_status IN ('verified', 'rejected', 'suspended') THEN
        v_email := new.email;
        IF v_email IS NOT NULL AND v_anon_key IS NOT NULL AND v_anon_key != '' THEN
            PERFORM net.http_post(
                url := v_url,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_anon_key
                ),
                body := jsonb_build_object(
                    'to', v_email,
                    'name', COALESCE(new.business_name, new.name, 'Organizer'),
                    'decision', new.organizer_status
                )
            );
        END IF;
    END IF;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
