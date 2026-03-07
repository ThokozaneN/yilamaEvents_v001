import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        console.log("[CRON] Starting notification and cleanup cycle...");

        // 1. Run Cleanup
        const { error: cleanupError } = await supabase.rpc('cleanup_expired_tickets');
        if (cleanupError) {
            console.error("[CRON] Cleanup failed:", cleanupError);
        } else {
            console.log("[CRON] Expired tickets cleanup complete.");
        }

        // 2. Identify upcoming events (within 24 hours)
        const { data: upcomingEvents, error: fetchError } = await supabase.rpc('generate_upcoming_event_notifications');

        if (fetchError) {
            throw fetchError;
        }

        console.log(`[CRON] Found ${upcomingEvents?.length || 0} users to notify for upcoming events.`);

        if (upcomingEvents && upcomingEvents.length > 0) {
            for (const item of upcomingEvents) {
                const { user_id, event_id, event_title, email } = item;

                // A. Insert in-app notification (idempotency handled by RPC)
                const { error: notifyError } = await supabase
                    .from('app_notifications')
                    .insert({
                        user_id,
                        title: 'Event Tomorrow! 🎫',
                        body: `Your ticket for "${event_title}" is ready. We can't wait to see you!`,
                        type: 'event_update',
                        action_url: `/events/${event_id}`
                    });

                if (notifyError) console.error(`[CRON] In-app notification failed for user ${user_id}:`, notifyError);

                // B. Send Email via Resend
                if (RESEND_API_KEY) {
                    try {
                        const emailRes = await fetch('https://api.resend.com/emails', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${RESEND_API_KEY}`,
                            },
                            body: JSON.stringify({
                                from: 'Yilama Events <tickets@yilama.africa>',
                                to: [email],
                                subject: `Reminder: ${event_title} is tomorrow!`,
                                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #000;">Ready for the show? 🎫</h2>
                    <p>Hi there,</p>
                    <p>This is a friendly reminder that <strong>${event_title}</strong> starts in less than 24 hours!</p>
                    <p>Make sure you have your ticket ready in your <a href="https://yilama.africa/wallet" style="color: #007bff; text-decoration: none;">digital wallet</a>.</p>
                    <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-radius: 5px;">
                      <p style="margin: 0; font-size: 14px; color: #666;">Don't forget to arrive early to avoid long queues at the gate!</p>
                    </div>
                    <p style="margin-top: 30px; font-size: 12px; color: #999;">See you there,<br>The Yilama Events Team</p>
                  </div>
                `
                            }),
                        });

                        if (!emailRes.ok) {
                            console.error(`[CRON] Resend failed for ${email}:`, await emailRes.text());
                        } else {
                            console.log(`[CRON] Email sent to ${email}`);
                        }
                    } catch (emailErr) {
                        console.error(`[CRON] Resend fetch error for ${email}:`, emailErr);
                    }
                }
            }
        }

        // 3. Notify for unused tickets (Currently happening)
        const { data: unusedTickets } = await supabase.rpc('generate_unused_ticket_notifications');
        if (unusedTickets && unusedTickets.length > 0) {
            for (const item of unusedTickets) {
                await supabase.from('app_notifications').insert({
                    user_id: item.user_id,
                    title: 'Ticket Waiting 🎫',
                    body: `"${item.event_title}" is live! Don't forget to present your ticket at the gate.`,
                    type: 'event_update',
                    action_url: `/events/${item.event_id}`
                });
            }
        }

        // 4. Notify for expired tickets
        const { data: expiredTickets } = await supabase.rpc('generate_expired_ticket_notifications');
        if (expiredTickets && expiredTickets.length > 0) {
            for (const item of expiredTickets) {
                await supabase.from('app_notifications').insert({
                    user_id: item.user_id,
                    title: 'Ticket Expired ⚠️',
                    body: `Your ticket for "${item.event_title}" has expired and will be removed from your vault soon.`,
                    type: 'system',
                    action_url: '/wallet'
                });
            }
        }

        return new Response(JSON.stringify({
            success: true,
            upcoming: upcomingEvents?.length || 0,
            unused: unusedTickets?.length || 0,
            expired: expiredTickets?.length || 0
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("[CRON] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
