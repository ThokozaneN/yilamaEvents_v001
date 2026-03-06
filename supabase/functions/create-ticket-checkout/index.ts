import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * YILAMA EVENTS: TICKET CHECKOUT INITIATOR
 * Creates an order + billing_payment record and returns a signed PayFast redirect.
 * 
 * Flow:
 *  1. Frontend calls this function after user confirms ticket qty/tier selection
 *  2. This function calls `purchase_tickets` RPC to create an order_id
 *  3. Creates a `billing_payments` record linking the order to the payment
 *  4. Returns the PayFast URL + params
 *  5. Frontend builds a form and POSTs to PayFast
 *  6. PayFast calls `payfast-itn` with COMPLETE status
 *  7. `payfast-itn` calls `confirm_order_payment` to mint the tickets
 */

const isAllowedOrigin = (origin: string | null): boolean => {
    if (!origin) return false;
    const lowerOrigin = origin.toLowerCase();
    return (
        lowerOrigin === 'https://app.yilama.co.za' ||
        lowerOrigin === 'https://yilama.co.za' ||
        lowerOrigin.startsWith('http://localhost:') ||
        lowerOrigin.endsWith('.vercel.app')
    );
};

const corsHeaders = (reqOrigin: string | null): Record<string, string> => ({
    'Access-Control-Allow-Origin': isAllowedOrigin(reqOrigin) ? reqOrigin! : 'https://app.yilama.co.za',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
});


// Pure-JS MD5 — needed because Deno's SubtleCrypto blocks MD5 (not FIPS-compliant)
function md5(input: string): string {
    function safeAdd(x: number, y: number) {
        const lsw = (x & 0xFFFF) + (y & 0xFFFF);
        return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF);
    }
    function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
    function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
    const bytes = new TextEncoder().encode(input);
    const len8 = bytes.length;
    const len32 = Math.ceil((len8 + 9) / 64) * 16;
    const m = new Int32Array(len32);
    for (let i = 0; i < len8; i++) {
        const idx = i >> 2;
        m[idx] = (m[idx] ?? 0) | ((bytes[i] ?? 0) << ((i % 4) * 8));
    }
    const finalIdx = len8 >> 2;
    m[finalIdx] = (m[finalIdx] ?? 0) | (0x80 << ((len8 % 4) * 8));
    m[len32 - 2] = len8 * 8;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < len32; i += 16) {
        const [oa, ob, oc, od] = [a, b, c, d];
        a = md5ff(a, b, c, d, m[i] || 0, 7, -680876936); d = md5ff(d, a, b, c, m[i + 1] || 0, 12, -389564586); c = md5ff(c, d, a, b, m[i + 2] || 0, 17, 606105819); b = md5ff(b, c, d, a, m[i + 3] || 0, 22, -1044525330);
        a = md5ff(a, b, c, d, m[i + 4] || 0, 7, -176418897); d = md5ff(d, a, b, c, m[i + 5] || 0, 12, 1200080426); c = md5ff(c, d, a, b, m[i + 6] || 0, 17, -1473231341); b = md5ff(b, c, d, a, m[i + 7] || 0, 22, -45705983);
        a = md5ff(a, b, c, d, m[i + 8] || 0, 7, 1770035416); d = md5ff(d, a, b, c, m[i + 9] || 0, 12, -1958414417); c = md5ff(c, d, a, b, m[i + 10] || 0, 17, -42063); b = md5ff(b, c, d, a, m[i + 11] || 0, 22, -1990404162);
        a = md5ff(a, b, c, d, m[i + 12] || 0, 7, 1804603682); d = md5ff(d, a, b, c, m[i + 13] || 0, 12, -40341101); c = md5ff(c, d, a, b, m[i + 14] || 0, 17, -1502002290); b = md5ff(b, c, d, a, m[i + 15] || 0, 22, 1236535329);
        a = md5gg(a, b, c, d, m[i + 1] || 0, 5, -165796510); d = md5gg(d, a, b, c, m[i + 6] || 0, 9, -1069501632); c = md5gg(c, d, a, b, m[i + 11] || 0, 14, 643717713); b = md5gg(b, c, d, a, m[i] || 0, 20, -373897302);
        a = md5gg(a, b, c, d, m[i + 5] || 0, 5, -701558691); d = md5gg(d, a, b, c, m[i + 10] || 0, 9, 38016083); c = md5gg(c, d, a, b, m[i + 15] || 0, 14, -660478335); b = md5gg(b, c, d, a, m[i + 4] || 0, 20, -405537848);
        a = md5gg(a, b, c, d, m[i + 9] || 0, 5, 568446438); d = md5gg(d, a, b, c, m[i + 14] || 0, 9, -1019803690); c = md5gg(c, d, a, b, m[i + 3] || 0, 14, -187363961); b = md5gg(b, c, d, a, m[i + 8] || 0, 20, 1163531501);
        a = md5gg(a, b, c, d, m[i + 13] || 0, 5, -1444681467); d = md5gg(d, a, b, c, m[i + 2] || 0, 9, -51403784); c = md5gg(c, d, a, b, m[i + 7] || 0, 14, 1735328473); b = md5gg(b, c, d, a, m[i + 12] || 0, 20, -1926607734);
        a = md5hh(a, b, c, d, m[i + 5] || 0, 4, -378558); d = md5hh(d, a, b, c, m[i + 8] || 0, 11, -2022574463); c = md5hh(c, d, a, b, m[i + 11] || 0, 16, 1839030562); b = md5hh(b, c, d, a, m[i + 14] || 0, 23, -35309556);
        a = md5hh(a, b, c, d, m[i + 1] || 0, 4, -1530992060); d = md5hh(d, a, b, c, m[i + 4] || 0, 11, 1272893353); c = md5hh(c, d, a, b, m[i + 7] || 0, 16, -155497632); b = md5hh(b, c, d, a, m[i + 10] || 0, 23, -1094730640);
        a = md5hh(a, b, c, d, m[i + 13] || 0, 4, 681279174); d = md5hh(d, a, b, c, m[i] || 0, 11, -358537222); c = md5hh(c, d, a, b, m[i + 3] || 0, 16, -722521979); b = md5hh(b, c, d, a, m[i + 6] || 0, 23, 76029189);
        a = md5hh(a, b, c, d, m[i + 9] || 0, 4, -640364487); d = md5hh(d, a, b, c, m[i + 12] || 0, 11, -421815835); c = md5hh(c, d, a, b, m[i + 15] || 0, 16, 530742520); b = md5hh(b, c, d, a, m[i + 2] || 0, 23, -995338651);
        a = md5ii(a, b, c, d, m[i] || 0, 6, -198630844); d = md5ii(d, a, b, c, m[i + 7] || 0, 10, 1126891415); c = md5ii(c, d, a, b, m[i + 14] || 0, 15, -1416354905); b = md5ii(b, c, d, a, m[i + 5] || 0, 21, -57434055);
        a = md5ii(a, b, c, d, m[i + 12] || 0, 6, 1700485571); d = md5ii(d, a, b, c, m[i + 3] || 0, 10, -1894986606); c = md5ii(c, d, a, b, m[i + 10] || 0, 15, -1051523); b = md5ii(b, c, d, a, m[i + 1] || 0, 21, -2054922799);
        a = md5ii(a, b, c, d, m[i + 8] || 0, 6, 1873313359); d = md5ii(d, a, b, c, m[i + 15] || 0, 10, -30611744); c = md5ii(c, d, a, b, m[i + 6] || 0, 15, -1560198380); b = md5ii(b, c, d, a, m[i + 13] || 0, 21, 1309151649);
        a = md5ii(a, b, c, d, m[i + 4] || 0, 6, -145523070); d = md5ii(d, a, b, c, m[i + 11] || 0, 10, -1120210379); c = md5ii(c, d, a, b, m[i + 2] || 0, 15, 718787259); b = md5ii(b, c, d, a, m[i + 9] || 0, 21, -343485551);
        a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
    }
    return [a, b, c, d].map(n => { const u = new Uint8Array(new Int32Array([n]).buffer); return Array.from(u).map(b => b.toString(16).padStart(2, '0')).join(''); }).join('');
}

serve(async (req: Request) => {

    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) });

    // Outer guard: ensure we ALWAYS return a proper CORS response even on catastrophic failure
    try {

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID');
        const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY');
        const passphrase = Deno.env.get('PAYFAST_PASSPHRASE');

        // S-5: Hard failure on missing credentials — never fall back to hardcoded sandbox values
        const missingSecrets = [
            !supabaseUrl && 'SUPABASE_URL',
            !supabaseServiceKey && 'SUPABASE_SERVICE_ROLE_KEY',
            !merchantId && 'PAYFAST_MERCHANT_ID',
            !merchantKey && 'PAYFAST_MERCHANT_KEY',
            !passphrase && 'PAYFAST_PASSPHRASE',
        ].filter(Boolean);

        if (missingSecrets.length > 0) {
            console.error('[TICKET_CHECKOUT] FATAL: Missing secrets:', missingSecrets.join(', '));
            return new Response(
                JSON.stringify({ error: 'Server misconfigured. Contact support.' }),
                { status: 500, headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
            );
        }

        // S-6: Consistent production check — only 'production' enables live PayFast
        const isProduction = Deno.env.get('PAYFAST_ENVIRONMENT') === 'production';

        const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

        // DEBUG: Verify environment sync
        console.log(`[TICKET_CHECKOUT] Project URL: ${supabaseUrl}`);
        console.log(`[TICKET_CHECKOUT] Service Key Prefix: ${supabaseServiceKey?.substring(0, 10)}...`);

        // 1. Identify the buyer — verify the JWT cryptographically via Supabase Auth.
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('[TICKET_CHECKOUT] Missing or invalid Authorization header');
            return new Response(
                JSON.stringify({ error: 'Unauthorized', message: 'Missing Authorization header.' }),
                { status: 401, headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
            );
        }

        const jwt = authHeader.replace('Bearer ', '');

        // Use the service role key + user token so RLS and auth.getUser() work correctly.
        // As per documentation and audit requirements:
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const userClient = createClient(supabaseUrl!, supabaseServiceRoleKey, {
            global: { headers: { Authorization: authHeader } }
        });

        // 2. Validate the session attached to the headers
        console.log('[TICKET_CHECKOUT] Validating JWT session...');
        const { data: { user }, error: authErr } = await userClient.auth.getUser();

        if (authErr || !user) {
            console.error('[TICKET_CHECKOUT] JWT verification failed:', authErr?.message || 'No user found');
            return new Response(
                JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired session.' }),
                { status: 401, headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } }
            );
        }

        console.log(`[TICKET_CHECKOUT] Verified user: ${user.id}`);

        // 2. Parse request body
        const { eventId, ticketTypeId, quantity, attendeeNames, promoCode, seatIds } = await req.json();

        if (!eventId || !ticketTypeId || !quantity) {
            throw new Error('Missing required fields: eventId, ticketTypeId, quantity');
        }

        if (seatIds && Array.isArray(seatIds) && seatIds.length > 0 && seatIds.length !== quantity) {
            throw new Error('Quantity must match the number of selected seats');
        }

        // 3. Get buyer profile
        const { data: profile } = await supabase
            .from('v_composite_profiles')
            .select('name, email')
            .eq('id', user.id)
            .single();

        // 4. Call purchase_tickets RPC to reserve the tickets and get an order ID
        // NOTE: Must pass p_user_id explicitly — the service-role client causes auth.uid()
        // to return NULL inside the RPC, which would set owner_user_id = NULL on all tickets.
        const { data: orderId, error: orderErr } = await supabase.rpc('purchase_tickets', {
            p_event_id: eventId,
            p_ticket_type_id: ticketTypeId,
            p_quantity: quantity,
            p_attendee_names: attendeeNames?.length ? attendeeNames : Array(quantity).fill(profile?.name || 'Attendee'),
            p_buyer_email: profile?.email || user.email,
            p_buyer_name: profile?.name || 'Attendee',
            p_promo_code: promoCode || null,
            p_user_id: user.id,  // Explicit — avoids auth.uid() = NULL in service-role context
            // Pass empty array (not null) so Postgres resolves to the uuid[] overload unambiguously
            p_seat_ids: (seatIds && seatIds.length > 0) ? seatIds : [],
        });

        if (orderErr) {
            console.error('[TICKET_CHECKOUT] purchase_tickets RPC failed:', JSON.stringify(orderErr));
            throw new Error(orderErr.message || orderErr.details || 'Failed to reserve tickets. Please try again.');
        }

        // 5. Get the order amount from DB
        const { data: order, error: orderFetchErr } = await supabase
            .from('orders')
            .select('total_amount, events(title)')
            .eq('id', orderId)
            .single();

        if (orderFetchErr || !order) throw new Error('Failed to fetch order details');

        const amount = Number(order.total_amount);
        const eventTitle = (order.events as any)?.title || 'Event Ticket';

        // 6. Create a unique payment reference that links to the order
        const mPaymentId = `TKT-${orderId}`;

        // 7. Store the payment pending record — P-2.1: HARD FATAL
        // If this fails, the order must be cancelled to prevent orphaned pending orders
        // with no payment reference (which would block amount validation in payfast-itn).
        const { error: payErr } = await supabase
            .from('billing_payments')
            .insert({
                user_id: user.id,
                amount,
                provider_ref: mPaymentId,
                status: 'pending',
                metadata: { type: 'ticket_order', order_id: orderId }
            });

        if (payErr) {
            // Cancel the order so inventory is released on next cron run
            await supabase.from('orders').update({ status: 'failed' }).eq('id', orderId);
            console.error('[TICKET_CHECKOUT] billing_payment insert failed — order cancelled:', payErr.message);
            throw new Error('Failed to initialise payment record. Please try again.');
        }

        const currentOrigin = req.headers.get('origin') || 'https://app.yilama.co.za';
        const redirectOrigin = isAllowedOrigin(currentOrigin) ? currentOrigin : 'https://app.yilama.co.za';


        // Build pfData in the exact order documented by PayFast.
        // The signature string MUST iterate keys in the SAME order as form fields are posted.
        const pfData: Record<string, string> = {
            merchant_id: merchantId!,
            merchant_key: merchantKey!,
            return_url: `${redirectOrigin}/tickets?order=${orderId}&payment=success`,
            cancel_url: `${redirectOrigin}/event/${eventId}?payment=cancelled`,

            notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
            name_first: (profile?.name || 'Attendee').split(' ')[0],
            name_last: (profile?.name || '').split(' ').slice(1).join(' ') || '',
            email_address: profile?.email || user.email || '',
            m_payment_id: mPaymentId,
            amount: amount.toFixed(2),
            item_name: `${eventTitle} - x${quantity} Ticket(s)`,
            item_description: `Order #${orderId}`,
        };

        // Remove any empty/whitespace-only values (PayFast requirement)
        Object.keys(pfData).forEach(k => {
            if (pfData[k] === null || pfData[k] === undefined || (typeof pfData[k] === 'string' && pfData[k].trim() === '')) {
                delete pfData[k];
            }
        });

        // Generate MD5 signature — PHP urlencode() compatible
        const pfEncode = (val: string) =>
            encodeURIComponent(val).replace(/%20/g, '+').replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');

        let pfOutput = '';
        Object.keys(pfData).forEach((key) => { // NO .sort() — order must match form POST order
            const val = pfData[key];
            if (val && val !== '') {
                pfOutput += `${key}=${pfEncode(val.trim())}&`;
            }
        });

        let signatureBase = pfOutput.slice(0, -1);
        if (passphrase) {
            signatureBase += `&passphrase=${pfEncode(passphrase.trim())}`;
        }

        if (!isProduction) console.debug('[PAYFAST_SIGNATURE_BASE]', signatureBase);
        pfData.signature = md5(signatureBase);

        const checkoutUrl = isProduction
            ? 'https://www.payfast.co.za/eng/process'
            : 'https://sandbox.payfast.co.za/eng/process';

        return new Response(JSON.stringify({
            url: checkoutUrl,
            params: pfData,
            orderId,
            amount
        }), {
            headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });

    } catch (err) {
        // Surface the real error message regardless of error type
        const msg = err instanceof Error
            ? err.message
            : (err as any)?.message || (err as any)?.details || JSON.stringify(err) || 'Unexpected error';
        console.error('[TICKET_CHECKOUT]', msg);
        return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
        });
    }

})
