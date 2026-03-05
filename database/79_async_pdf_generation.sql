-- =============================================================================
-- 79_async_pdf_generation.sql
--
-- Performance Fix: Adds a new table `pending_ticket_emails` to store PDF
-- generation requests so that the `send-ticket-email` Edge Function doesn't
-- have to block synchronously for 15 seconds.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pending_ticket_emails (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    document_ids jsonb NOT NULL, -- Array of PDFMonkey document IDs
    user_id uuid REFERENCES profiles(id) NOT NULL,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retries integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE pending_ticket_emails ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table
CREATE POLICY "Service Role Full Access to pending_ticket_emails"
    ON pending_ticket_emails FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_pending_emails_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_pending_emails_updated_at ON pending_ticket_emails;
CREATE TRIGGER trigger_pending_emails_updated_at
    BEFORE UPDATE ON pending_ticket_emails
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_emails_updated_at();

-- Add a pg_cron job to process these emails every minute
-- Note: Requires pg_cron extension to be enabled in Supabase extensions
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Run every minute
        PERFORM cron.schedule(
            'process-async-ticket-emails',
            '* * * * *',
            $cron$
            SELECT net.http_post(
                url := current_setting('app.settings.edge_function_url') || '/process-ticket-emails',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
                ),
                body := '{}'::jsonb
            );
            $cron$
        );
    END IF;
END $$;
