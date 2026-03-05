/*
  # Yilama Events: Production Audit Patch v1.0
  
  Fixes identified in the Feb 2026 production audit:
  1. Adds missing `ticket_types.access_rules` JSONB column (was in 40_access_rules_engine.sql but not deployed)
  2. Adds missing `events.fee_preference` column for organizer's payout preference
  
  Safe to run multiple times (all statements are idempotent).
*/

-- 1. Ensure ticket_types has the access_rules column (from 40_access_rules_engine.sql)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_types' AND column_name = 'access_rules'
    ) THEN
        ALTER TABLE ticket_types ADD COLUMN access_rules JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Added access_rules column to ticket_types';
    ELSE
        RAISE NOTICE 'access_rules column already exists on ticket_types';
    END IF;
END $$;

-- 2. Ensure ticket_checkins has scan_zone (from 40_access_rules_engine.sql)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_checkins' AND column_name = 'scan_zone'
    ) THEN
        ALTER TABLE ticket_checkins ADD COLUMN scan_zone TEXT DEFAULT 'general';
        RAISE NOTICE 'Added scan_zone column to ticket_checkins';
    ELSE
        RAISE NOTICE 'scan_zone column already exists on ticket_checkins';
    END IF;
END $$;

-- 3. Add fee_preference to events table
-- 'upfront'    = organizer pays our 2% fee up front; ticket sale proceeds go directly to them
-- 'post_event' = we collect ticket sales, deduct 2%, forward profit within 3-7 business days
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'fee_preference'
    ) THEN
        ALTER TABLE events 
        ADD COLUMN fee_preference TEXT NOT NULL DEFAULT 'post_event'
        CHECK (fee_preference IN ('upfront', 'post_event'));
        RAISE NOTICE 'Added fee_preference column to events';
    ELSE
        RAISE NOTICE 'fee_preference column already exists on events';
    END IF;
END $$;

-- 4. Add index for fee_preference queries (used by payout processing)
CREATE INDEX IF NOT EXISTS idx_events_fee_preference ON events(fee_preference);

-- Verify the changes
SELECT 
    table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE 
    (table_name = 'ticket_types' AND column_name = 'access_rules')
    OR (table_name = 'ticket_checkins' AND column_name = 'scan_zone')
    OR (table_name = 'events' AND column_name = 'fee_preference')
ORDER BY table_name, column_name;
