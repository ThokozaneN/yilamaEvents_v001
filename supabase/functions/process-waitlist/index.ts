import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
    // This function is called by a database webhook, not by browsers — no CORS needed.
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200 })
    }

    // ── SECURITY: Webhook Secret Guard ─────────────────────────────────────────
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    const incomingSecret = req.headers.get('x-webhook-secret')
    if (!webhookSecret || incomingSecret !== webhookSecret) {
        console.error('[process-waitlist] Unauthorized: missing or invalid x-webhook-secret')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    try {
        const payload = await req.json()
        // payload: { type: 'UPDATE', table: 'events', record: { id, status, title... }, old_record: { status... } }

        const event = payload.record;
        const oldEvent = payload.old_record;

        if (!event || !oldEvent) {
            return new Response(JSON.stringify({ error: 'Missing webhook payload' }), { status: 400 })
        }

        // Only process if status changed FROM coming_soon
        if (oldEvent.status !== 'coming_soon' || event.status === 'coming_soon') {
            return new Response(JSON.stringify({ message: 'Irrelevant status change' }), { status: 200 })
        }

        const isPublished = event.status === 'published';
        const isCancelled = event.status === 'cancelled';

        if (!isPublished && !isCancelled) {
            return new Response(JSON.stringify({ message: 'Status change ignored' }), { status: 200 })
        }

        // 1. Fetch waitlist for this event
        const { data: waitlist, error: wErr } = await supabase
            .from('event_waitlists')
            .select('id, email, user_id, status')
            .eq('event_id', event.id)
            .eq('status', 'waiting')

        if (wErr) {
            console.error("Waitlist fetch error", wErr);
            throw new Error("Failed to fetch waitlist");
        }

        if (!waitlist || waitlist.length === 0) {
            return new Response(JSON.stringify({ message: 'Waitlist is empty or already notified' }), { status: 200 })
        }

        console.log(`Found ${waitlist.length} users waiting for event ${event.title}`);

        // 2. Prepare Resend Payload
        let subject = '';
        let htmlContent = '';

        if (isPublished) {
            subject = `Tickets are LIVE: ${event.title} 🎟️`;
            htmlContent = `
            <div style="font-family: sans-serif; padding: 20px; color: #111;">
                <h2>Good news! 🎉</h2>
                <p>The wait is over. Tickets for <strong>${event.title}</strong> are officially on sale now.</p>
                <p>Grab your tickets before they sell out!</p>
                <a href="https://app.yilama.co.za/events/${event.id}" style="display:inline-block; padding:12px 24px; background:#111; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:20px;">
                Buy Tickets Now
                </a>
            </div>
         `;
        } else if (isCancelled) {
            subject = `Update on ${event.title}`;
            htmlContent = `
             <div style="font-family: sans-serif; padding: 20px; color: #111;">
                <h2>Event Update</h2>
                <p>We're sorry to announce that <strong>${event.title}</strong> has been cancelled and will not be proceeding.</p>
                <p>Thank you for your initial interest.</p>
            </div>
         `;
        }

        // Process in batches of 50 to respect rate limits
        const BATCH_SIZE = 50;
        const notifiedIds = [];

        for (let i = 0; i < waitlist.length; i += BATCH_SIZE) {
            const batch = waitlist.slice(i, i + BATCH_SIZE);

            // Resend batch email format
            const bulkPayload = batch.map(w => ({
                from: 'Yilama Events <dev@thokozane.co.za>',
                to: [w.email],
                subject: subject,
                html: htmlContent
            }));

            try {
                const resendRes = await fetch('https://api.resend.com/emails/batch', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bulkPayload)
                });

                if (!resendRes.ok) {
                    console.error("Resend batch failed:", await resendRes.text());
                    continue;
                }

                notifiedIds.push(...batch.map(b => b.id));
            } catch (err) {
                console.error("Batch send error", err);
            }
        }

        // 3. Mark as notified
        if (notifiedIds.length > 0) {
            await supabase
                .from('event_waitlists')
                .update({ status: 'notified', updated_at: new Date().toISOString() })
                .in('id', notifiedIds)
        }

        return new Response(JSON.stringify({
            success: true,
            notified_count: notifiedIds.length,
            total_waiting: waitlist.length
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (err) {
        console.error(err)
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
