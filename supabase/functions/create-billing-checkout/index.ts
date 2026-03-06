import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * YILAMA EVENTS: BILLING CHECKOUT INITIATOR (v2.0 — Security Hardened)
 * Prepares the PayFast redirection payload for organizer tier upgrades.
 */

const PRODUCTION_ORIGIN = 'https://app.yilama.co.za';

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

function getAllowedOrigin(reqOrigin: string | null): string {
  if (isAllowedOrigin(reqOrigin)) return reqOrigin!;
  return PRODUCTION_ORIGIN;
}

function corsHeaders(reqOrigin: string | null) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(reqOrigin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
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
  const reqOrigin = req.headers.get('origin');
  const headers = corsHeaders(reqOrigin);

  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  // ─── Load & Validate Secrets ────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const merchantId = Deno.env.get('PAYFAST_MERCHANT_ID');
  const merchantKey = Deno.env.get('PAYFAST_MERCHANT_KEY');
  const passphrase = Deno.env.get('PAYFAST_PASSPHRASE');

  const missingSecrets = [
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseServiceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !merchantId && 'PAYFAST_MERCHANT_ID',
    !merchantKey && 'PAYFAST_MERCHANT_KEY',
    !passphrase && 'PAYFAST_PASSPHRASE',
  ].filter(Boolean);

  if (missingSecrets.length > 0) {
    console.error('[BILLING_CHECKOUT] FATAL: Missing secrets:', missingSecrets.join(', '));
    return new Response(
      JSON.stringify({ error: 'Server misconfigured. Contact support.' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  const isProduction = Deno.env.get('PAYFAST_ENVIRONMENT') === 'production';

  try {
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      console.error('[BILLING_CHECKOUT] Auth Error:', JSON.stringify(authErr));
      throw new Error(`Authentication failed: ${authErr?.message || 'Invalid session'}`);
    }

    const { tier, paymentMethod } = await req.json();

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, organizer_status, name, email')
      .eq('id', user.id)
      .single();

    if (profileErr || profile.role !== 'organizer' || profile.organizer_status !== 'verified') {
      throw new Error('ACCOUNT_NOT_VERIFIED: Only fully verified organizers can upgrade plans.');
    }

    const prices: Record<string, number> = { pro: 79.00, premium: 119.00 };
    const amount = prices[tier];
    if (!amount) throw new Error('INVALID_TIER');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        plan_id: tier,
        status: 'pending_verification',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      .select()
      .single();

    if (subErr) throw subErr;

    const mPaymentId = crypto.randomUUID();
    const { error: payErr } = await supabase
      .from('billing_payments')
      .insert({
        user_id: user.id,
        subscription_id: sub.id,
        amount,
        provider_ref: mPaymentId,
        status: 'pending',
      });
    if (payErr) throw payErr;

    const origin = reqOrigin || PRODUCTION_ORIGIN;
    const nameParts = (profile.name || 'Organizer').split(' ');

    const pfData: Record<string, string> = {
      merchant_id: merchantId!,
      merchant_key: merchantKey!,
      return_url: `${origin}/organizer?billing=success`,
      cancel_url: `${origin}/organizer?billing=cancel`,
      notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
      name_first: nameParts[0],
      name_last: nameParts.slice(1).join(' ') || '',
      email_address: profile.email || '',
      m_payment_id: mPaymentId,
      amount: amount.toFixed(2),
      item_name: `Yilama - ${tier.toUpperCase()} Plan`,
    };

    // Add optional payment method override (e.g., 'cc', 'ap', 'sp')
    if (paymentMethod) {
      pfData.payment_method = paymentMethod;
    }

    Object.keys(pfData).forEach(k => {
      if (!pfData[k] || pfData[k].trim() === '') delete pfData[k];
    });

    const pfEncode = (val: string) =>
      encodeURIComponent(val).replace(/%20/g, '+').replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');

    let pfOutput = '';
    Object.keys(pfData).forEach((key) => {
      if (pfData[key] !== '') pfOutput += `${key}=${pfEncode(pfData[key].trim())}&`;
    });

    let signatureBase = pfOutput.slice(0, -1);
    signatureBase += `&passphrase=${pfEncode(passphrase!.trim())}`;
    pfData.signature = md5(signatureBase);

    const checkoutUrl = isProduction
      ? 'https://www.payfast.co.za/eng/process'
      : 'https://sandbox.payfast.co.za/eng/process';

    return new Response(
      JSON.stringify({ url: checkoutUrl, params: pfData }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[BILLING_CHECKOUT]', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }
})