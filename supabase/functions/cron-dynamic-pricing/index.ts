import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
    try {
        // This function is meant to be called by pg_cron or an external scheduling service
        // Ensure it's called securely (e.g. check a secret header if exposed)
        const authHeader = req.headers.get("Authorization");
        if (authHeader !== `Bearer ${Deno.env.get("CRON_SECRET")}`) {
            console.warn("Unauthorized attempt to run cron-dynamic-pricing");
            // Allow execution for local dev if no secret is set, but restrict in prod
            if (Deno.env.get("CRON_SECRET")) {
                return new Response("Unauthorized", { status: 401 });
            }
        }

        console.log("Starting Dynamic Pricing Evaluation...");

        // Call the database RPC to evaluate pricing rules
        const { error } = await supabase.rpc("evaluate_dynamic_pricing");

        if (error) {
            console.error("Error evaluating dynamic pricing:", error);
            throw error;
        }

        console.log("Dynamic Pricing Evaluation Completed Successfully.");

        return new Response(JSON.stringify({ success: true, message: "Pricing evaluated." }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
        });
    }
});
