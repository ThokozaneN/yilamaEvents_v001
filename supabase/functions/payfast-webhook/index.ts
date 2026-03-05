/**
 * YILAMA EVENTS: DEPRECATED WEBHOOK HANDLER
 *
 * ⚠️  THIS FUNCTION HAS BEEN DEPRECATED AND REPLACED BY `payfast-itn`.
 *
 * This file is intentionally left in place only to prevent a 404 if the old
 * endpoint URL was ever accidentally saved anywhere. It rejects all requests.
 * 
 * Do NOT add this URL to PayFast as a notify_url.
 * The live ITN endpoint is: /functions/v1/payfast-itn
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve((_req) => {
  console.error('[DEPRECATED] payfast-webhook was called. This endpoint is retired. Use payfast-itn.');
  return new Response(
    JSON.stringify({ error: 'This endpoint is deprecated. The active ITN handler is /functions/v1/payfast-itn' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  );
})
