import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing environment variables');
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Find scanner users whose events ended > 12 hours ago
        const cutoffTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

        const { data: expiredScanners, error: queryError } = await supabaseAdmin
            .from('event_scanners')
            .select(`
                id,
                user_id,
                event:events ( id, title, ends_at, starts_at )
            `)
            .eq('is_active', false); // pg_cron marks them inactive first

        if (queryError) throw queryError;

        if (!expiredScanners || expiredScanners.length === 0) {
            return new Response(JSON.stringify({ success: true, deleted: 0, message: 'No expired scanners to clean up.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // Filter to only those where the event ended > 12 hours ago
        const toDelete = expiredScanners.filter((s: any) => {
            const event = s.event;
            if (!event) return false;
            const eventEnd = event.ends_at
                ? new Date(event.ends_at)
                : new Date(new Date(event.starts_at).getTime() + 6 * 60 * 60 * 1000);
            return eventEnd < new Date(cutoffTime);
        });

        let deletedCount = 0;
        const errors: string[] = [];

        for (const scanner of toDelete) {
            try {
                // 1. Delete auth user (cascades cleanups in profiles via foreign key)
                const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(scanner.user_id);
                if (deleteAuthError) {
                    errors.push(`Failed to delete auth user ${scanner.user_id}: ${deleteAuthError.message}`);
                    continue;
                }

                // 2. Remove the event_scanners row
                await supabaseAdmin.from('event_scanners').delete().eq('id', scanner.id);

                deletedCount++;
                console.log(`Deleted scanner ${scanner.user_id} for event ${scanner.event?.title}`);
            } catch (err: any) {
                errors.push(`Error processing scanner ${scanner.user_id}: ${err.message}`);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            deleted: deletedCount,
            errors: errors.length > 0 ? errors : undefined,
            message: `Cleanup complete. Deleted ${deletedCount} expired scanner account(s).`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Cleanup Scanners Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
