import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * YILAMA EVENTS: CRON — Release Expired Reservations
 *
 * Scheduled every 30 minutes to expire pending ticket orders that never
 * completed payment. This returns inventory back to the pool.
 *
 * The Supabase scheduler calls this with a service-role-signed JWT in the
 * Authorization header. The `verify_jwt = true` setting in config.toml
 * ensures only Supabase itself (or a holder of the service role key) can
 * trigger this function.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (_req) => {
    try {
        const { data: released, error } = await supabase.rpc("release_expired_reservations");

        if (error) {
            console.error("[CRON] release_expired_reservations failed:", error.message);
            return new Response(JSON.stringify({ success: false, error: error.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

        console.log(`[CRON] Released ${released} expired reservation(s)`);

        return new Response(
            JSON.stringify({ success: true, released }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("[CRON] Unexpected error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
