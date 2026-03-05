/*
  # Yilama Events: Advanced Access Rules Engine
  
  Extends the ticketing validation system to support multi-entry passes, 
  zone-based restrictions, and time cooldowns within a single RPC call.
*/

-- 1. Extend Ticket Types with Access Rules
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_types' AND column_name = 'access_rules') THEN
        ALTER TABLE ticket_types ADD COLUMN access_rules JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Extend Checkins with Zones
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_checkins' AND column_name = 'scan_zone') THEN
        ALTER TABLE ticket_checkins ADD COLUMN scan_zone TEXT DEFAULT 'general';
    END IF;
END $$;

-- 3. Replace the Validation RPC with the Rules Engine
CREATE OR REPLACE FUNCTION validate_ticket_scan(
    p_ticket_public_id UUID,
    p_event_id UUID,
    p_scanner_id UUID,
    p_zone TEXT DEFAULT 'general',
    p_signature TEXT DEFAULT NULL -- TOTP or signature payload
)
RETURNS JSONB AS $$
DECLARE
    v_ticket_data RECORD;
    v_rules JSONB;
    v_success_scans INT;
    v_last_scan_time TIMESTAMPTZ;
    v_allowed_zones TEXT[];
    
    -- Rules
    v_rule_max_entries INT;
    v_rule_cooldown_mins INT;
BEGIN
    -- 1. Lookup Ticket & Rules
    SELECT t.id, t.status, t.event_id, t.ticket_type_id, 
           tt.name AS tier_name, tt.access_rules, p.name AS owner_name
    INTO v_ticket_data
    FROM tickets t
    LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
    LEFT JOIN profiles p ON t.owner_user_id = p.id
    WHERE t.public_id = p_ticket_public_id;

    -- Validate Existence
    IF v_ticket_data.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ticket not found', 'code', 'NOT_FOUND');
    END IF;

    -- Validate Event Match
    IF v_ticket_data.event_id != p_event_id THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'invalid_event');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket belongs to different event', 'code', 'WRONG_EVENT');
    END IF;
    
    -- Validate Status
    IF v_ticket_data.status != 'valid' THEN
         INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'invalid_status');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket is ' || v_ticket_data.status, 'code', 'INVALID_STATUS');
    END IF;

    -- 2. Rules Evaluation
    v_rules := COALESCE(v_ticket_data.access_rules, '{}'::jsonb);
    
    -- Extract limits (Defaults: 1 entry, 0 cooldown, any zone)
    v_rule_max_entries := COALESCE((v_rules->>'max_entries')::INT, 1);
    v_rule_cooldown_mins := COALESCE((v_rules->>'cooldown_minutes')::INT, 0);

    -- 2a. Zone Evaluation
    IF v_rules ? 'allowed_zones' THEN
        SELECT array_agg(x::text) INTO v_allowed_zones FROM jsonb_array_elements_text(v_rules->'allowed_zones') x;
        IF p_zone != ANY(v_allowed_zones) THEN
            INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
            VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'invalid_zone');
            RETURN jsonb_build_object('success', false, 'message', 'Access denied to this zone', 'code', 'INVALID_ZONE');
        END IF;
    END IF;

    -- 2b. Multi-Entry Check
    SELECT count(*), max(scanned_at) 
    INTO v_success_scans, v_last_scan_time
    FROM ticket_checkins 
    WHERE ticket_id = v_ticket_data.id AND result = 'success';

    IF v_success_scans >= v_rule_max_entries THEN
        INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
        VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'duplicate');
        RETURN jsonb_build_object('success', false, 'message', 'Ticket already used ' || v_success_scans || ' times', 'code', 'DUPLICATE');
    END IF;

    -- 2c. Cooldown Check
    IF v_rule_cooldown_mins > 0 AND v_last_scan_time IS NOT NULL THEN
        IF now() < v_last_scan_time + (v_rule_cooldown_mins || ' minutes')::interval THEN
            INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
            VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'cooldown_active');
            RETURN jsonb_build_object('success', false, 'message', 'Please wait before re-entering', 'code', 'COOLDOWN_ACTIVE');
        END IF;
    END IF;


    -- 3. Success! Record Check-in
    INSERT INTO ticket_checkins (ticket_id, scanner_id, event_id, scan_zone, result) 
    VALUES (v_ticket_data.id, p_scanner_id, p_event_id, p_zone, 'success');

    -- Update ticket status to used ONLY IF max entries reached?
    -- Actually, if we allow multi-entry, 'used' might mean fully consumed.
    IF (v_success_scans + 1) >= v_rule_max_entries THEN
        UPDATE tickets SET status = 'used', updated_at = now() WHERE id = v_ticket_data.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Valid Ticket', 
        'code', 'SUCCESS', 
        'ticket', jsonb_build_object(
            'tier', v_ticket_data.tier_name,
            'owner', v_ticket_data.owner_name,
            'entries_remaining', v_rule_max_entries - (v_success_scans + 1)
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
