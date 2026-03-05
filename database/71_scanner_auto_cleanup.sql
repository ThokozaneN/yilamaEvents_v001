/*
  # Scanner Auto-Cleanup: pg_cron Job
  
  Dependencies: 04_events_and_permissions.sql (event_scanners table)
  
  ## What This Does:
  1. Creates a pg_cron scheduled job that runs every hour
  2. Marks event_scanners rows as inactive (is_active = false) when the event
     ended more than 12 hours ago
  3. This is a "soft deactivation" step — the actual auth.users deletion is
     handled by the cleanup-scanners Edge Function (invoked daily via cron schedule
     configured in the Supabase dashboard)

  ## Manual Instructions:
  After running this SQL:
  1. Go to Supabase Dashboard → Edge Functions
  2. Deploy `cleanup-scanners` function
  3. Go to Dashboard → Settings → Scheduled Functions (or pg_cron)
  4. Configure the cleanup-scanners function to run on a daily cron: `0 2 * * *`
     (runs at 2AM daily — adjust to your timezone)
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to mark expired scanner accounts as inactive
CREATE OR REPLACE FUNCTION public.deactivate_expired_scanners()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_cutoff_time TIMESTAMPTZ;
BEGIN
  -- 12 hours after event ends
  v_cutoff_time := NOW() - INTERVAL '12 hours';

  -- Mark scanners as inactive where their event has ended > 12 hours ago
  WITH expired AS (
    SELECT es.id
    FROM event_scanners es
    JOIN events e ON e.id = es.event_id
    WHERE es.is_active = true
      AND (
        -- Event has explicit end time > 12 hours ago
        (e.ends_at IS NOT NULL AND e.ends_at < v_cutoff_time)
        OR
        -- Event has no end time, assume 6 hours after start — check if that was > 12 hours ago
        (e.ends_at IS NULL AND (e.starts_at + INTERVAL '6 hours') < v_cutoff_time)
      )
  )
  UPDATE event_scanners
  SET is_active = false
  WHERE id IN (SELECT id FROM expired);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RAISE NOTICE 'Deactivated % expired scanner(s)', v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the soft-deactivation to run every hour
-- This just marks them inactive — the Edge Function handles the auth.users deletion
SELECT cron.schedule(
  'deactivate-expired-scanners-hourly',  -- job name (unique)
  '0 * * * *',                           -- every hour at :00
  $$SELECT public.deactivate_expired_scanners()$$
);
