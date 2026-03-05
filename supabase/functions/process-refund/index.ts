import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * YILAMA EVENTS: PROCESS REFUND (v2.0 — Security Hardened)
 *
 * Security & integrity fixes:
 *  - S-9:  Real PayFast refund API call (no longer mocked)
 *  - Links to real payments.id (no placeholder UUID)
 *  - Sets refund.status = 'pending' initially; updates to 'completed' after gateway confirms
 *  - S-19: CORS restricted to configured origin
 */

const PRODUCTION_ORIGIN = 'https://app.yilama.co.za';
const PAYFAST_REFUND_API = 'https://api.payfast.co.za/refunds';
const PAYFAST_REFUND_SANDBOX_API = 'https://api.payfast.co.za/refunds'; // PayFast uses same domain; sandbox flag is a header

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID") ?? "";
const payfastPassphrase = Deno.env.get("PAYFAST_PASSPHRASE") ?? "";
const isProduction = Deno.env.get("PAYFAST_ENVIRONMENT") === "production";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Pure-JS MD5 — needed for PayFast signature generation in Deno
function md5(input: string): string {
    function safeAdd(x: number, y: number) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF); }
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
    for (let i = 0; i < len8; i++) m[i >> 2] |= bytes[i] << ((i % 4) * 8);
    m[len8 >> 2] |= 0x80 << ((len8 % 4) * 8);
    m[len32 - 2] = len8 * 8;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < len32; i += 16) {
        const [oa, ob, oc, od] = [a, b, c, d];
        a = md5ff(a, b, c, d, m[i], 7, -680876936); d = md5ff(d, a, b, c, m[i + 1], 12, -389564586); c = md5ff(c, d, a, b, m[i + 2], 17, 606105819); b = md5ff(b, c, d, a, m[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, m[i + 4], 7, -176418897); d = md5ff(d, a, b, c, m[i + 5], 12, 1200080426); c = md5ff(c, d, a, b, m[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, m[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, m[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, m[i + 9], 12, -1958414417); c = md5ff(c, d, a, b, m[i + 10], 17, -42063); b = md5ff(b, c, d, a, m[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, m[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, m[i + 13], 12, -40341101); c = md5ff(c, d, a, b, m[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, m[i + 15], 22, 1236535329);
        a = md5gg(a, b, c, d, m[i + 1], 5, -165796510); d = md5gg(d, a, b, c, m[i + 6], 9, -1069501632); c = md5gg(c, d, a, b, m[i + 11], 14, 643717713); b = md5gg(b, c, d, a, m[i], 20, -373897302);
        a = md5gg(a, b, c, d, m[i + 5], 5, -701558691); d = md5gg(d, a, b, c, m[i + 10], 9, 38016083); c = md5gg(c, d, a, b, m[i + 15], 14, -660478335); b = md5gg(b, c, d, a, m[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, m[i + 9], 5, 568446438); d = md5gg(d, a, b, c, m[i + 14], 9, -1019803690); c = md5gg(c, d, a, b, m[i + 3], 14, -187363961); b = md5gg(b, c, d, a, m[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, m[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, m[i + 2], 9, -51403784); c = md5gg(c, d, a, b, m[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, m[i + 12], 20, -1926607734);
        a = md5hh(a, b, c, d, m[i + 5], 4, -378558); d = md5hh(d, a, b, c, m[i + 8], 11, -2022574463); c = md5hh(c, d, a, b, m[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, m[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, m[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, m[i + 4], 11, 1272893353); c = md5hh(c, d, a, b, m[i + 7], 16, -155497632); b = md5hh(b, c, d, a, m[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, m[i + 13], 4, 681279174); d = md5hh(d, a, b, c, m[i], 11, -358537222); c = md5hh(c, d, a, b, m[i + 3], 16, -722521979); b = md5hh(b, c, d, a, m[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, m[i + 9], 4, -640364487); d = md5hh(d, a, b, c, m[i + 12], 11, -421815835); c = md5hh(c, d, a, b, m[i + 15], 16, 530742520); b = md5hh(b, c, d, a, m[i + 2], 23, -995338651);
        a = md5ii(a, b, c, d, m[i], 6, -198630844); d = md5ii(d, a, b, c, m[i + 7], 10, 1126891415); c = md5ii(c, d, a, b, m[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, m[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, m[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, m[i + 3], 10, -1894986606); c = md5ii(c, d, a, b, m[i + 10], 15, -1051523); b = md5ii(b, c, d, a, m[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, m[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, m[i + 15], 10, -30611744); c = md5ii(c, d, a, b, m[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, m[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, m[i + 4], 6, -145523070); d = md5ii(d, a, b, c, m[i + 11], 10, -1120210379); c = md5ii(c, d, a, b, m[i + 2], 15, 718787259); b = md5ii(b, c, d, a, m[i + 9], 21, -343485551);
        a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
    }
    return [a, b, c, d].map(n => { const u = new Uint8Array(new Int32Array([n]).buffer); return Array.from(u).map(b => b.toString(16).padStart(2, '0')).join(''); }).join('');
}

/**
 * Builds the PayFast API authorization signature header.
 * Reference: https://developers.payfast.co.za/docs#authentication
 */
function buildPayFastApiSignature(params: Record<string, string>, passphrase: string): string {
    const sorted = Object.keys(params).sort().reduce((acc, k) => {
        acc[k] = params[k];
        return acc;
    }, {} as Record<string, string>);

    let pfParamString = '';
    for (const [key, val] of Object.entries(sorted)) {
        pfParamString += `${key}=${encodeURIComponent(val.trim()).replace(/%20/g, '+')}&`;
    }
    pfParamString = pfParamString.slice(0, -1);
    if (passphrase) {
        pfParamString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
    }
    return md5(pfParamString);
}

serve(async (req) => {
    const reqOrigin = req.headers.get("origin");
    const allowedOrigin = isProduction ? PRODUCTION_ORIGIN : (reqOrigin || PRODUCTION_ORIGIN);

    const responseHeaders = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: responseHeaders });
    }

    try {
        // ── Authentication ────────────────────────────────────────────────────────
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: responseHeaders });
        }

        // Use user-scoped client to enforce RLS on ownership checks
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authErr } = await userClient.auth.getUser();
        if (authErr || !user) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: responseHeaders });
        }

        const body = await req.json();
        const { order_id, ticket_id, reason } = body;

        if (!order_id) {
            return new Response(JSON.stringify({ error: "order_id is required" }), { status: 400, headers: responseHeaders });
        }

        console.log(`[REFUND] Processing: order=${order_id}, ticket=${ticket_id}, reason=${reason}`);

        // ── 1. Validate Ownership (RLS enforces this — organizer must own the event) ──
        const { data: orderData, error: orderError } = await userClient
            .from("orders")
            .select(`*, events!inner(organizer_id, title)`)
            .eq("id", order_id)
            .single();

        if (orderError || !orderData) {
            throw new Error("Order not found or permission denied.");
        }

        // ── 2. Look up the real payment record ────────────────────────────────────
        // S-9: Find the actual PayFast pf_payment_id stored at confirmation time
        const { data: paymentRecord, error: paymentErr } = await supabase
            .from("payments")
            .select("id, provider_tx_id, amount, status")
            .eq("order_id", order_id)
            .eq("status", "completed")
            .maybeSingle();

        if (paymentErr || !paymentRecord) {
            throw new Error("No completed payment found for this order. Cannot refund.");
        }

        // ── 3. Calculate refund amount ────────────────────────────────────────────
        let refundAmount: number;

        if (ticket_id) {
            // Partial refund for a specific ticket
            const { data: ticketData } = await supabase
                .from("order_items")
                .select("price_at_purchase")
                .eq("order_id", order_id)
                .eq("ticket_id", ticket_id)
                .single();
            if (!ticketData) throw new Error("Ticket not found in order");
            refundAmount = Number(ticketData.price_at_purchase);
        } else {
            refundAmount = Number(orderData.total_amount);
        }

        if (refundAmount <= 0) {
            throw new Error("Invalid refund amount");
        }

        // ── 4. Verify organizer has sufficient settled balance ────────────────────
        const { data: balanceData } = await userClient
            .from("v_organizer_balance")
            .select("available_balance")
            .single();

        if (!balanceData || Number(balanceData.available_balance) < refundAmount) {
            throw new Error(
                "Insufficient settled balance to process this refund. Please wait for more ticket sales to clear."
            );
        }

        // ── 5. Create Refund Record (pending until gateway confirms) ──────────────
        const { data: newRefund, error: refundErr } = await supabase
            .from("refunds")
            .insert({
                payment_id: paymentRecord.id,   // S-9: Real payments.id, not placeholder
                item_id: ticket_id || null,
                amount: refundAmount,
                reason: reason || "Organizer requested refund",
                status: "pending",              // Will be updated to 'approved' after gateway confirms
            })
            .select()
            .single();

        if (refundErr) throw refundErr;

        // ── 6. Call PayFast Refund API ────────────────────────────────────────────
        // Reference: https://developers.payfast.co.za/docs#refunds
        const timestamp = new Date().toISOString().replace('T', 'T').slice(0, 19); // ISO 8601 without ms
        const version = "v1";

        const pfParams: Record<string, string> = {
            merchant_id: merchantId,
            version,
            timestamp,
        };

        const signature = buildPayFastApiSignature(pfParams, payfastPassphrase);

        const refundBody = JSON.stringify({
            amount: Math.round(refundAmount * 100), // PayFast API expects cents
        });

        const payfastApiUrl = `${isProduction ? PAYFAST_REFUND_API : PAYFAST_REFUND_SANDBOX_API}/${paymentRecord.provider_tx_id}`;

        let gatewaySuccess = false;
        let gatewayResponse: any = {};

        try {
            const gatewayRes = await fetch(payfastApiUrl, {
                method: "POST",
                headers: {
                    "merchant-id": merchantId,
                    "version": version,
                    "timestamp": timestamp,
                    "signature": signature,
                    "Content-Type": "application/json",
                    // PayFast sandbox mode — only active in non-production
                    ...(isProduction ? {} : { "sandbox": "true" }),
                },
                body: refundBody,
            });

            gatewayResponse = await gatewayRes.json().catch(() => ({}));
            gatewaySuccess = gatewayRes.ok;

            console.log(`[REFUND] PayFast API response ${gatewayRes.status}:`, JSON.stringify(gatewayResponse));
        } catch (gatewayErr: any) {
            console.error("[REFUND] PayFast API call failed:", gatewayErr.message);
            // Mark refund as failed — do not process ledger changes
            await supabase.from("refunds").update({ status: "failed" }).eq("id", newRefund.id);
            throw new Error(`Payment gateway error: ${gatewayErr.message}`);
        }

        if (!gatewaySuccess) {
            await supabase.from("refunds").update({ status: "failed" }).eq("id", newRefund.id);
            throw new Error(`PayFast rejected the refund: ${JSON.stringify(gatewayResponse)}`);
        }

        // ── 7. Gateway confirmed — update records ─────────────────────────────────
        // Mark refund approved — this triggers the on_refund_completed DB trigger
        // which handles the financial_transactions ledger debit automatically.
        await supabase.from("refunds").update({ status: "approved" }).eq("id", newRefund.id);

        // Update ticket / order status
        if (ticket_id) {
            await supabase
                .from("tickets")
                .update({ status: "refunded", updated_at: new Date().toISOString() })
                .eq("id", ticket_id);
        } else {
            await supabase
                .from("orders")
                .update({ status: "refunded", updated_at: new Date().toISOString() })
                .eq("id", order_id);

            const { data: orderItems } = await supabase
                .from("order_items")
                .select("ticket_id")
                .eq("order_id", order_id);

            if (orderItems?.length) {
                await supabase
                    .from("tickets")
                    .update({ status: "refunded", updated_at: new Date().toISOString() })
                    .in("id", orderItems.map((i: any) => i.ticket_id));
            }
        }

        console.log(`[REFUND] ✅ Refund of R${refundAmount} approved for order ${order_id}`);

        return new Response(
            JSON.stringify({ success: true, message: "Refund processed successfully.", amount: refundAmount }),
            { status: 200, headers: responseHeaders }
        );

    } catch (err: any) {
        console.error("[REFUND] Failed:", err.message);
        // S-20: No stack traces to clients
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: responseHeaders }
        );
    }
});
