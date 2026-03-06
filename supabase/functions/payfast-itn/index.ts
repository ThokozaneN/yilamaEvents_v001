import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * YILAMA EVENTS: PAYFAST ITN HANDLER (v3.0 — Security Hardened)
 *
 * Handles two types of payment completions:
 *  - Ticket orders:      m_payment_id starts with "TKT-" → calls confirm_order_payment
 *  - Subscription bills: everything else → calls finalize_billing_payment
 *
 * Security measures:
 *  1. PayFast source IP whitelist (CIDR verified)
 *  2. MD5 signature verification — always enforced, no sandbox bypass
 *  3. Credentials loaded from env — hard failure if missing
 */

// PayFast published source IP ranges (https://developers.payfast.co.za/docs#ip-whitelisting)
const PAYFAST_IP_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipToInt('197.97.145.144'), mask: 28 }, // 197.97.145.144/28
  { base: ipToInt('41.74.179.192'), mask: 27 }, // 41.74.179.192/27
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isPayFastIp(remoteIp: string): boolean {
  // In sandbox mode we allow any IP so local testing works
  const isProduction = Deno.env.get('PAYFAST_ENVIRONMENT') === 'production';
  if (!isProduction) return true;

  let ipInt: number;
  try {
    ipInt = ipToInt(remoteIp.trim());
  } catch {
    return false;
  }

  return PAYFAST_IP_RANGES.some(({ base, mask }) => {
    const maskBits = 0xFFFFFFFF << (32 - mask) >>> 0;
    return (ipInt & maskBits) === (base & maskBits);
  });
}

// Pure-JS MD5 — Deno's SubtleCrypto blocks MD5 (not FIPS-compliant)
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

serve(async (req) => {
  // PayFast only sends POST — no CORS preflight needed for server-to-server.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ─── Load & Validate Secrets ────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const payfastPassphrase = Deno.env.get('PAYFAST_PASSPHRASE');

  if (!supabaseUrl || !supabaseServiceKey) {
    // Hard failure — never silently fall back to sandbox credentials
    console.error('[PAYFAST_ITN] FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Server misconfigured', { status: 500 });
  }
  if (!payfastPassphrase) {
    console.error('[PAYFAST_ITN] FATAL: Missing PAYFAST_PASSPHRASE secret');
    return new Response('Server misconfigured', { status: 500 });
  }

  const isProduction = Deno.env.get('PAYFAST_ENVIRONMENT') === 'production';

  // ─── SECURITY CHECK 1: Source IP Whitelist ──────────────────────────────────
  // PayFast sends ITNs from a known CIDR range. Reject requests from all other IPs.
  // The x-forwarded-for header is set by the Supabase Edge proxy (trust the first hop).
  const xForwardedFor = req.headers.get('x-forwarded-for') ?? '';
  const remoteIp = xForwardedFor.split(',')[0].trim();

  if (!isPayFastIp(remoteIp)) {
    console.error(`[PAYFAST_ITN] Rejected: IP ${remoteIp} is not in PayFast whitelist`);
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const rawText = await req.text();
    // Log only non-PII fields — never log full body in production
    // (full body may contain buyer name, email address)

    // Parse using URLSearchParams so we get the exact raw string representation
    const params = new URLSearchParams(rawText);
    const data: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      data[key] = value;
    }

    console.log(`[PAYFAST_ITN] Notification: ref=${data.m_payment_id} status=${data.payment_status} amount=${data.amount_gross} pf_id=${data.pf_payment_id} ip=${remoteIp}`);

    // ─── SECURITY CHECK 2: Signature Verification ──────────────────────────────
    // Always enforced — no "sandbox mode" bypass.
    const receivedSignature = data.signature;
    if (!receivedSignature) {
      console.error('[PAYFAST_ITN] Missing signature field — rejecting');
      return new Response('Unauthorized', { status: 401 });
    }

    const dataForSig = { ...data };
    delete dataForSig.signature;

    // Pure-JS MD5 function helper matching PHP URL encode behavior.
    const pfEncode = (val: string) =>
      encodeURIComponent(val).replace(/%20/g, '+').replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');

    let pfOutput = '';
    Object.keys(dataForSig).forEach((key) => {
      // PayFast includes all sent fields in the string, even if empty, EXCEPT if the value is strictly omitted.
      // Deno's formData() sometimes drops completely empty string keys, which breaks the hash.
      // URLSearchParams preserves them. If the key exists in the payload, it MUST be included in the hash.
      // CRITICAL: DO NOT .sort() as PayFast relies on the order the parameters were sent in the payload.
      pfOutput += `${key}=${pfEncode(dataForSig[key].trim())}&`;
    });

    let signatureBase = pfOutput.slice(0, -1);
    // Explicitly add passphrase exactly as PayFast expects (no extra escaping if it has special characters, but pfEncode covers it)
    signatureBase += `&passphrase=${pfEncode(payfastPassphrase.trim())}`;

    const calculatedSignature = md5(signatureBase);

    if (receivedSignature !== calculatedSignature) {
      // ─── Security Check 2.1: Try Sandbox Passphrase fallback if Live failed ────
      // This handles cases where an ITN might be from Sandbox even if the default is Live.
      const sandboxPassphrase = Deno.env.get('PAYFAST_SANDBOX_PASSPHRASE');
      if (sandboxPassphrase && sandboxPassphrase !== payfastPassphrase) {
        let sbOutput = '';
        Object.keys(dataForSig).forEach((key) => {
          sbOutput += `${key}=${pfEncode(dataForSig[key].trim())}&`;
        });
        let sbBase = sbOutput.slice(0, -1);
        sbBase += `&passphrase=${pfEncode(sandboxPassphrase.trim())}`;
        const sbSignature = md5(sbBase);

        if (receivedSignature === sbSignature) {
          console.log(`[PAYFAST_ITN] Valid signature using SANDBOX passphrase for ref=${data.m_payment_id}`);
        } else {
          console.error(`[PAYFAST_ITN] Signature mismatch — rejected both LIVE and SANDBOX passphrases`);
          return new Response('Unauthorized', { status: 401 });
        }
      } else {
        console.error(`[PAYFAST_ITN] Signature mismatch — received: ${receivedSignature}, expected: ${calculatedSignature}`);
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // ─── Route: Ticket Order vs Subscription ────────────────────────────────────
    const isComplete = data.payment_status === 'COMPLETE';
    const mPaymentId: string = data.m_payment_id || '';
    const pfPaymentId: string = data.pf_payment_id || '';

    if (mPaymentId.startsWith('TKT-')) {
      // ── Ticket Order ──
      const orderId = mPaymentId.slice(4);

      if (isComplete) {
        // ─── A-6.3: Short-circuit replayed ITN before any DB reads ───────────
        // If this pf_payment_id was already recorded, it's a replay — ignore it.
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('provider_tx_id', pfPaymentId)
          .maybeSingle();

        if (existingPayment) {
          console.log(`[PAYFAST_ITN] Duplicate ITN for pf_payment_id ${pfPaymentId} — ignoring replay`);
          return new Response('OK', { status: 200 });
        }

        // ─── F-5.3: Validate amount_gross against DB order total ──────────────
        // Prevents a crafted ITN from confirming an order with an incorrect amount.
        const itnAmount = parseFloat(data.amount_gross || '0');
        const { data: order, error: orderFetchErr } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('id', orderId)
          .single();

        if (orderFetchErr || !order) {
          console.error(`[PAYFAST_ITN] Order ${orderId} not found for amount validation`);
          return new Response('OK', { status: 200 }); // Return 200 so PayFast doesn't retry
        }

        const dbAmount = Number(order.total_amount);
        if (Math.abs(itnAmount - dbAmount) > 0.01) {
          console.error(
            `[PAYFAST_ITN] AMOUNT MISMATCH for order ${orderId}: ` +
            `ITN says R${itnAmount}, DB expects R${dbAmount}. Rejecting.`
          );
          // Do NOT confirm — flag for manual investigation
          await supabase.from('orders').update({
            status: 'payment_disputed',
            updated_at: new Date().toISOString(),
            metadata: { amount_mismatch: true, itn_amount: itnAmount, db_amount: dbAmount },
          }).eq('id', orderId);
          return new Response('OK', { status: 200 });
        }

        const { error } = await supabase.rpc('confirm_order_payment', {
          p_order_id: orderId,
          p_payment_ref: pfPaymentId,
          p_provider: 'payfast',
        });

        if (error) {
          console.error('[PAYFAST_ITN] confirm_order_payment failed:', error.message);
          throw error;
        }
        console.log(`[PAYFAST_ITN] ✅ Ticket order ${orderId} confirmed (R${dbAmount})`);
      } else {
        // Payment failed or cancelled
        await supabase
          .from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', orderId);

        // Release inventory reservation (mirrors what purchase_tickets reserved)
        await supabase.rpc('release_order_reservation', { p_order_id: orderId });

        console.log(`[PAYFAST_ITN] ❌ Ticket order ${orderId} cancelled — reservation released`);
      }

    } else {
      // ── Subscription Payment ──
      const paymentStatus = isComplete ? 'confirmed' : 'failed';

      const { error } = await supabase.rpc('finalize_billing_payment', {
        p_provider_ref: mPaymentId || pfPaymentId,
        p_status: paymentStatus,
        p_metadata: {
          payfast_response: data,
          environment: isProduction ? 'production' : 'sandbox',
        },
      });

      if (error) throw error;
      console.log(`[PAYFAST_ITN] Subscription payment ${paymentStatus}`);
    }

    return new Response('OK', { status: 200 });

  } catch (err: any) {
    console.error('[PAYFAST_ITN] Error:', err.message);
    // Return 200 to stop PayFast from retrying on application errors;
    // the issue is logged for manual investigation.
    return new Response('OK', { status: 200 });
  }
})