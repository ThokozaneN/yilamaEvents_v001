/*
  # Yilama Events: Experiences Schema Enhancements
  
  Adds `image_url` and `category` to the `experiences` table to match
  the rich UI requirements of the marketplace.
*/

ALTER TABLE experiences 
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Experience';

-- Add a helper function to safely reserve a slot natively in Postgres
CREATE OR REPLACE FUNCTION reserve_experience_slot(
    p_session_id UUID,
    p_user_id UUID,
    p_quantity INT
) RETURNS UUID AS $$
DECLARE
    v_experience_id UUID;
    v_max_capacity INT;
    v_current_locked INT;
    v_reservation_id UUID;
BEGIN
    -- 1. Get Session & Experience Details
    SELECT experience_id, max_capacity INTO v_experience_id, v_max_capacity
    FROM experience_sessions
    WHERE id = p_session_id AND status = 'active'
    FOR UPDATE; -- Lock session row for concurrency safety

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session is not active or does not exist.';
    END IF;

    -- 2. Calculate currently locked inventory (Reserved + Confirmed)
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_locked
    FROM experience_reservations
    WHERE session_id = p_session_id 
      AND status IN ('reserved', 'confirmed')
      AND (status = 'confirmed' OR expires_at > now());

    -- 3. Check Capacity
    IF (v_current_locked + p_quantity) > v_max_capacity THEN
        RAISE EXCEPTION 'Not enough available slots for this session.';
    END IF;

    -- 4. Create Soft Lock Reservation (Expires in 15 minutes)
    INSERT INTO experience_reservations (
        session_id, user_id, quantity, status, expires_at
    ) VALUES (
        p_session_id, p_user_id, p_quantity, 'reserved', now() + INTERVAL '15 minutes'
    ) RETURNING id INTO v_reservation_id;

    RETURN v_reservation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
