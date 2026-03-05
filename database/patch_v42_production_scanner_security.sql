-- PRODUCTION TICKET SCANNING SECURITY PATCH
-- This patch implements cryptographic ticket validation and atomic check-ins.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ENHANCE TICKETS TABLE
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS secret_key UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS scanned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS qr_payload TEXT;

-- Index for fast lookups during scanning
CREATE INDEX IF NOT EXISTS idx_tickets_public_id ON tickets (public_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets (event_id);

-- 2. AUTOMATIC SIGNING TRIGGER
-- This ensures every ticket has a valid, signed QR payload generated on the server.
CREATE OR REPLACE FUNCTION generate_ticket_qr_payload()
RETURNS TRIGGER AS $$
BEGIN
    -- Format: public_id:signature
    -- Signature = HMAC_SHA256(public_id + event_id, secret_key)
    NEW.qr_payload := NEW.public_id || ':' || encode(hmac(NEW.public_id || NEW.event_id::text, NEW.secret_key::text, 'sha256'), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_ticket_qr_payload ON tickets;
CREATE TRIGGER tr_generate_ticket_qr_payload
BEFORE INSERT OR UPDATE OF public_id, secret_key, event_id ON tickets
FOR EACH ROW EXECUTE FUNCTION generate_ticket_qr_payload();

-- Backfill existing tickets
UPDATE tickets SET secret_key = gen_random_uuid() WHERE secret_key IS NULL;

-- 3. UPGRADE SCAN LOGS TABLE (add columns introduced by this patch)
-- The base scan_logs table was created in phase 01. We add the new columns idempotently.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'event_id') THEN
        ALTER TABLE scan_logs ADD COLUMN event_id UUID REFERENCES events(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'status') THEN
        ALTER TABLE scan_logs ADD COLUMN status TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'raw_payload') THEN
        ALTER TABLE scan_logs ADD COLUMN raw_payload TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'ip_address') THEN
        ALTER TABLE scan_logs ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'metadata') THEN
        ALTER TABLE scan_logs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Backfill status from `result` (the original column) for any existing rows
UPDATE scan_logs SET status = result WHERE status IS NULL AND result IS NOT NULL;

-- RLS: ensure enabled
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies cleanly
DROP POLICY IF EXISTS "Scanners can view logs for their assigned events" ON scan_logs;
CREATE POLICY "Scanners can view logs for their assigned events" ON scan_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM event_scanners
            WHERE event_scanners.event_id = scan_logs.event_id
            AND event_scanners.user_id = auth.uid()
            AND event_scanners.is_active = true
        )
        OR
        EXISTS (
            SELECT 1 FROM events
            WHERE events.id = scan_logs.event_id
            AND events.organizer_id = auth.uid()
        )
    );

-- 4. SECURE SCANNING RPC
CREATE OR REPLACE FUNCTION scan_ticket(
    p_qr_payload TEXT,
    p_event_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket_public_id TEXT;
    v_signature TEXT;
    v_ticket RECORD;
    v_expected_signature TEXT;
    v_status TEXT;
    v_attendee_name TEXT;
    v_ticket_type TEXT;
    v_used_at TIMESTAMPTZ;
BEGIN
    -- 1. DECODE PAYLOAD
    BEGIN
        v_ticket_public_id := split_part(p_qr_payload, ':', 1);
        v_signature := split_part(p_qr_payload, ':', 2);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO scan_logs (event_id, scanner_id, status, raw_payload)
        VALUES (p_event_id, auth.uid(), 'INVALID_FORMAT', p_qr_payload);
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_format');
    END;

    -- 2. LOCK TICKET ROW & FETCH DATA
    SELECT t.*, tt.name as type_name
    INTO v_ticket
    FROM tickets t
    JOIN ticket_types tt ON t.ticket_type_id = tt.id
    WHERE t.public_id = v_ticket_public_id
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO scan_logs (event_id, scanner_id, status, raw_payload)
        VALUES (p_event_id, auth.uid(), 'INVALID_TICKET', p_qr_payload);
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_ticket');
    END IF;

    -- 3. VERIFY SIGNATURE (Exact server-side check)
    v_expected_signature := encode(hmac(v_ticket_public_id || v_ticket.event_id::text, v_ticket.secret_key::text, 'sha256'), 'hex');
    
    IF v_signature != v_expected_signature THEN
        INSERT INTO scan_logs (ticket_id, event_id, scanner_id, status, raw_payload)
        VALUES (v_ticket.id, p_event_id, auth.uid(), 'TAMPERED', p_qr_payload);
        RETURN jsonb_build_object('success', false, 'reason', 'tampered');
    END IF;

    -- 4. VERIFY EVENT MATCH
    IF v_ticket.event_id != p_event_id THEN
        INSERT INTO scan_logs (ticket_id, event_id, scanner_id, status, raw_payload)
        VALUES (v_ticket.id, p_event_id, auth.uid(), 'WRONG_EVENT', p_qr_payload);
        RETURN jsonb_build_object('success', false, 'reason', 'wrong_event');
    END IF;

    -- 5. CHECK STATUS
    IF v_ticket.status = 'used' THEN
        INSERT INTO scan_logs (ticket_id, event_id, scanner_id, status, raw_payload)
        VALUES (v_ticket.id, p_event_id, auth.uid(), 'DUPLICATE', p_qr_payload);
        
        RETURN jsonb_build_object(
            'success', false, 
            'reason', 'already_used',
            'attendee_name', v_ticket.attendee_name,
            'used_at', v_ticket.used_at
        );
    END IF;

    -- 6. PERFORM ATOMIC CHECK-IN
    UPDATE tickets
    SET 
        status = 'used',
        used_at = now(),
        scanned_by = auth.uid()
    WHERE id = v_ticket.id;

    -- 7. LOG SUCCESS & RETURN
    INSERT INTO scan_logs (ticket_id, event_id, scanner_id, status, raw_payload)
    VALUES (v_ticket.id, p_event_id, auth.uid(), 'VALID', p_qr_payload);

    RETURN jsonb_build_object(
        'success', true,
        'attendee_name', v_ticket.attendee_name,
        'ticket_type', v_ticket.type_name
    );

END;
$$;
