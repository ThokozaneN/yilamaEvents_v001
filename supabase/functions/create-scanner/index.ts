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
            throw new Error('Supabase admin credentials not configured.');
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Verify the caller (Organizer)
        const authHeader = req.headers.get('Authorization')!;
        if (!authHeader) throw new Error('No authorization header');

        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) throw new Error('Invalid token format');

        // It's safer to use the anon client to verify the user token to ensure RLS and policies apply
        // But since we are bypassing RLS in the edge function with the service key, we MUST verify the JWT properly.
        const supabaseAnonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '');
        const { data: { user }, error: authError } = await supabaseAnonClient.auth.getUser(token);

        if (authError || !user) {
            console.error('Auth Error:', authError);
            throw new Error(`Auth Error: ${authError?.message || 'No user context'}.`);
        }

        const { event_id, name, gate_name, temporary_password } = await req.json();

        if (!event_id || !name || !gate_name || !temporary_password) {
            throw new Error('Missing required fields');
        }

        // 1. Verify Organizer + Limits via RPC (we can reuse `check_organizer_limits` or manually check)
        // First, check if user owns event
        const { data: eventData, error: eventError } = await supabaseAdmin
            .from('events')
            .select('id, organizer_id')
            .eq('id', event_id)
            .eq('organizer_id', user.id)
            .single();

        if (eventError || !eventData) {
            throw new Error(`Event Authorization Error: Not your event or event doesn't exist`);
        }

        // Check Limits
        const { data: planData, error: planError } = await supabaseAdmin
            .rpc('get_organizer_plan', { p_user_id: user.id });

        if (planError || !planData || planData.length === 0) {
            throw new Error('Could not verify account limits');
        }

        const plan = planData[0];
        const scannersLimit = plan.scanners_limit;

        // Count existing active scanners for this event
        const { count, error: countError } = await supabaseAdmin
            .from('event_scanners')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event_id)
            .eq('is_active', true);

        if (countError) throw countError;

        if (count !== null && count >= scannersLimit) {
            throw new Error(`Scanner limit reached for your ${plan.plan_name} tier (${scannersLimit} max). Upgrade your plan to add more.`);
        }

        // 2. Format a unique email for the scanner
        const safeEventId = event_id.split('-')[0];
        const timestamp = Date.now().toString().slice(-6);
        const scannerEmail = `scanner_${safeEventId}_${timestamp}@yilamacore.app`;

        // 3. Admin: Create Auth User
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: scannerEmail,
            password: temporary_password,
            email_confirm: true, // Auto confirm so they can login immediately
            user_metadata: {
                role: 'scanner',
                name: name
            }
        });

        if (createError) {
            console.error('Auth Creation Error:', createError);
            throw new Error(`Failed to provision account: ${createError.message}`);
        }

        const newUserId = authData.user.id;

        // 4. Update Profile Role (since the trigger creates it as 'attendee' by default)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({ role: 'scanner', name: name })
            .eq('id', newUserId);

        if (profileError) {
            console.error('Profile Update Error:', profileError);
            // Attempt to rollback although tricky with auth users
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw new Error('Failed to update scanner profile role');
        }

        // 5. Assign to Event
        const { error: assignmentError } = await supabaseAdmin
            .from('event_scanners')
            .insert({
                event_id: event_id,
                user_id: newUserId,
                gate_name: gate_name,
                is_active: true
            });

        if (assignmentError) {
            console.error('Assignment Error:', assignmentError);
            await supabaseAdmin.auth.admin.deleteUser(newUserId);
            throw new Error('Failed to assign scanner to event');
        }

        return new Response(JSON.stringify({
            success: true,
            email: scannerEmail,
            user_id: newUserId,
            password: temporary_password
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Create Scanner Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
