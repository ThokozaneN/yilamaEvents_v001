-- =============================================================================
-- 84_fix_ledger_uuid_cast.sql
--
-- Hotfix: Resolves "operator does not exist: uuid = text" in PayFast ITN.
-- The live database created `financial_transactions.reference_id` as a UUID
-- before it was changed to TEXT in later schemas. When `ledger_on_order_paid` 
-- checks for idempotency, it does: `reference_id = NEW.id::text`.
-- This crashes Postgres. By explicitly casting both sides (`reference_id::text`),
-- the query becomes immune to underlying column type differences.
-- =============================================================================

CREATE OR REPLACE FUNCTION ledger_on_order_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_organizer_id uuid;
    v_fee_pct      numeric;
    v_fee_amount   numeric;
    v_already_done boolean;
BEGIN
    -- Only fire on 'paid' transition
    IF NEW.status != 'paid' OR OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    -- Get organizer
    SELECT e.organizer_id INTO v_organizer_id
    FROM events e WHERE e.id = NEW.event_id;

    IF v_organizer_id IS NULL THEN RETURN NEW; END IF;

    -- Idempotency check (EXPLICIT CAST ON BOTH SIDES TO FIX CRASH)
    SELECT EXISTS(
        SELECT 1 FROM financial_transactions
        WHERE reference_id::text = NEW.id::text AND reference_type = 'order' AND category = 'ticket_sale'
    ) INTO v_already_done;

    IF v_already_done THEN RETURN NEW; END IF;

    -- Credit: gross sale
    INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
    VALUES (v_organizer_id, 'credit', NEW.total_amount, 'ticket_sale', 'order', NEW.id, 'Sale ' || NEW.id);

    -- Platform Fee
    v_fee_pct := get_organizer_fee_percentage(v_organizer_id);
    v_fee_amount := ROUND(NEW.total_amount * v_fee_pct, 2);

    IF v_fee_amount > 0 THEN
        INSERT INTO financial_transactions (wallet_user_id, type, amount, category, reference_type, reference_id, description)
        VALUES (v_organizer_id, 'debit', v_fee_amount, 'platform_fee', 'order', NEW.id, 'Fee ' || NEW.id);
    END IF;

    RETURN NEW;
END;
$$;
