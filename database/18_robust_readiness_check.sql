/*
  # Yilama Events: Robust Readiness Check
  
  Updates the `is_organizer_ready` RPC to be case-insensitive and handle nulls safely.
*/

CREATE OR REPLACE FUNCTION is_organizer_ready(org_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_status text;
BEGIN
    SELECT verification_status INTO v_status FROM profiles WHERE id = org_id;
    
    -- Ensure case-insensitivity and handle nulls
    RETURN jsonb_build_object(
        'ready', (COALESCE(LOWER(v_status), '') = 'verified'),
        'missing', CASE WHEN COALESCE(LOWER(v_status), '') = 'verified' THEN '[]'::jsonb ELSE '["verification_pending"]'::jsonb END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
