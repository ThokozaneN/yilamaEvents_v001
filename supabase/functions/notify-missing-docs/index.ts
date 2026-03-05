/**
 * notify-missing-docs Edge Function
 * Sends an email to an organizer listing which required documents
 * are still missing from their verification submission.
 * Called from submit_verification() SQL RPC via pg_net.
 */

// @ts-ignore Deno types are available in the Edge Function runtime
const { serve } = Deno;

const DOC_LABELS: Record<string, string> = {
    id_proof: "National ID (passport, driver's license, or national ID card)",
    business_registration: 'Proof of Business (registration certificate or trade license)',
    tax_certificate: 'Tax Certificate (TIN certificate)',
    bank_statement: 'Bank Statement (recent, within last 3 months)',
};

serve(async (req: Request) => {
    // Server-to-server only (called via SQL pg_net) — no CORS needed.
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200 });
    }

    // ── SECURITY: Webhook Secret Guard ─────────────────────────────────────────
    // @ts-ignore Deno env available in runtime
    const webhookSecret: string = Deno.env.get('WEBHOOK_SECRET') ?? '';
    const incomingSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret || incomingSecret !== webhookSecret) {
        console.error('[notify-missing-docs] Unauthorized: invalid x-webhook-secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const { to, name, missing_docs } = await req.json() as {
            to: string;
            name: string;
            missing_docs: string[];
        };

        if (!to || !name || !missing_docs?.length) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: to, name, missing_docs' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const docList = missing_docs.map((d) => `• ${DOC_LABELS[d] ?? d}`).join('\n');

        const emailBody = `Hi ${name},

Thank you for submitting your verification request on Yilama Events.

We noticed that the following required document(s) are still missing from your submission:

${docList}

Your application has been received and is under review, but please upload the missing documents as soon as possible to avoid delays.

To upload your documents:
1. Log in to your Yilama Events account
2. Go to Studio → Registry tab
3. Upload the missing documents under "Document Upload"
4. Click "Submit for Verification" again

Best regards,
The Yilama Events Team`;

        // @ts-ignore Deno env available in runtime
        const supabaseUrl: string = Deno.env.get('SUPABASE_URL') ?? '';
        // @ts-ignore Deno env available in runtime
        const serviceRoleKey: string = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to,
                subject: 'Action Required: Missing Verification Documents — Yilama Events',
                body: emailBody,
            }),
        }).catch(() => null);

        console.log(`[notify-missing-docs] Notified ${to} about missing: ${missing_docs.join(', ')}`);

        return new Response(
            JSON.stringify({ success: true, notified: to, missing_count: missing_docs.length }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        console.error('[notify-missing-docs] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
