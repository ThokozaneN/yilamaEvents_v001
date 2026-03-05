/**
 * notify-verification-result Edge Function
 * Sends an email to an organizer with the result of their verification review.
 * Called from review_verification() SQL RPC via pg_net.
 */

Deno.serve(async (req) => {
    // Server-to-server only (called via SQL pg_net) — no CORS needed.
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200 });
    }

    // ── SECURITY: Webhook Secret Guard ─────────────────────────────────────────
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    const incomingSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret || incomingSecret !== webhookSecret) {
        console.error('[notify-verification-result] Unauthorized: invalid x-webhook-secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const { to, name, decision, reason } = await req.json() as {
            to: string;
            name: string;
            decision: 'verified' | 'rejected' | 'needs_update';
            reason?: string;
        };

        if (!to || !name || !decision) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: to, name, decision' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        let subject: string;
        let body: string;

        if (decision === 'verified') {
            subject = '🎉 Your Yilama Events account has been verified!';
            body = `
Hi ${name},

Great news! Your organizer account on Yilama Events has been successfully verified.

You can now:
✓ Create and publish public events
✓ Sell tickets to attendees
✓ Access financial settlement features

Log in to your account to get started: https://yilama.events

Welcome to the Yilama Events community!

Best regards,
The Yilama Events Team
      `.trim();

        } else if (decision === 'rejected') {
            subject = 'Update on your Yilama Events verification';
            body = `
Hi ${name},

We have reviewed your verification submission and unfortunately we are unable to approve it at this time.

Reason: ${reason ?? 'Please contact support for more information.'}

If you believe this is an error or would like to resubmit with updated documents, please:
1. Log in to your account
2. Go to Studio → Registry
3. Upload updated documents and resubmit

If you have questions, reply to this email.

Best regards,
The Yilama Events Team
      `.trim();

        } else {
            // needs_update
            subject = 'Action Required: Updates needed for your Yilama Events verification';
            body = `
Hi ${name},

We have reviewed your verification submission and require some updates before we can proceed.

What needs to be updated: ${reason ?? 'Please contact support for specific details.'}

To update your submission:
1. Log in to your account
2. Go to Studio → Registry
3. Upload the corrected documents and resubmit

Best regards,
The Yilama Events Team
      `.trim();
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Attempt to send via configured SMTP
        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, subject, body }),
        }).catch(() => null);

        console.log(`[notify-verification-result] Notified ${to} of decision: ${decision}`);

        return new Response(
            JSON.stringify({ success: true, notified: to, decision }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[notify-verification-result] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
