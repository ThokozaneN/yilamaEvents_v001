/**
 * PayFast ITN Security Tests
 *
 * Extracts and tests the pure-logic helpers from the payfast-itn Edge Function
 * (which runs in Deno) in a pure Node/Vitest environment.
 *
 * The functions are NOT imported from the Edge Function itself (it imports Deno
 * modules). Instead they are re-implemented here identically so we can test the
 * contract without Deno.
 */

import { describe, it, expect } from 'vitest';

// ─── Re-implementations mirroring payfast-itn/index.ts ───────────────────────

function ipToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isInCidr(ip: string, base: number, mask: number): boolean {
    const maskBits = (0xFFFFFFFF << (32 - mask)) >>> 0;
    return (ipToInt(ip) & maskBits) === (base & maskBits);
}

const PAYFAST_RANGES = [
    { base: ipToInt('197.97.145.144'), mask: 28 }, // 197.97.145.144/28
    { base: ipToInt('41.74.179.192'), mask: 27 }, // 41.74.179.192/27
];

function isPayFastIpProduction(ip: string): boolean {
    return PAYFAST_RANGES.some(({ base, mask }) => isInCidr(ip, base, mask));
}

/** Minimal JS MD5 extracted from payfast-itn (same algorithm). */
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

const pfEncode = (val: string) =>
    encodeURIComponent(val).replace(/%20/g, '+').replace(/!/g, '%21').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');

function buildSignatureBase(data: Record<string, string>, passphrase: string): string {
    const params = Object.entries(data)
        .map(([k, v]) => `${k}=${pfEncode(v.trim())}`)
        .join('&');
    return `${params}&passphrase=${pfEncode(passphrase.trim())}`;
}

// ─── IP Whitelist Tests ───────────────────────────────────────────────────────
describe('isPayFastIp', () => {
    it('accepts an IP inside the 197.97.145.144/28 range', () => {
        expect(isPayFastIpProduction('197.97.145.150')).toBe(true);
    });

    it('accepts an IP inside the 41.74.179.192/27 range', () => {
        expect(isPayFastIpProduction('41.74.179.200')).toBe(true);
    });

    it('rejects an IP outside all ranges', () => {
        expect(isPayFastIpProduction('8.8.8.8')).toBe(false);
    });

    it('rejects localhost', () => {
        expect(isPayFastIpProduction('127.0.0.1')).toBe(false);
    });

    it('rejects the next block outside 197.97.145.144/28', () => {
        // /28 covers .144–.159; .160 is out of range
        expect(isPayFastIpProduction('197.97.145.160')).toBe(false);
    });
});

// ─── MD5 Helper Tests ─────────────────────────────────────────────────────────
describe('md5', () => {
    it('produces the correct hash for "hello"', () => {
        // Known MD5 of "hello"
        expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('produces the correct hash for an empty string', () => {
        expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    });

    it('produces the correct hash for an ASCII sentence', () => {
        // known MD5 of "The quick brown fox jumps over the lazy dog"
        expect(md5('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    });
});

// ─── Signature Verification Tests ────────────────────────────────────────────
describe('PayFast signature verification', () => {
    const passphrase = 'jt7NOE43FZPn';

    const validPayload: Record<string, string> = {
        merchant_id: '10000100',
        merchant_key: '46f0cd694581a',
        return_url: 'https://www.example.com/return',
        cancel_url: 'https://www.example.com/cancel',
        notify_url: 'https://www.example.com/notify',
        name_first: 'First',
        name_last: 'Last',
        email_address: 'sbtu01@payfast.io',
        m_payment_id: 'TKT-abc123',
        amount: '200.00',
        item_name: 'Test+Product',
        payment_status: 'COMPLETE',
        pf_payment_id: '1c3b4a',
    };

    it('generates a consistent MD5 signature for a known payload', () => {
        const base = buildSignatureBase(validPayload, passphrase);
        const sig = md5(base);
        expect(sig).toHaveLength(32);
        expect(sig).toMatch(/^[a-f0-9]+$/);
    });

    it('returns the same signature twice for the same input (deterministic)', () => {
        const base = buildSignatureBase(validPayload, passphrase);
        expect(md5(base)).toBe(md5(base));
    });

    it('produces a different signature with a tampered amount', () => {
        const base1 = buildSignatureBase(validPayload, passphrase);
        const tampered = { ...validPayload, amount: '1.00' };
        const base2 = buildSignatureBase(tampered, passphrase);
        expect(md5(base1)).not.toBe(md5(base2));
    });

    it('produces a different signature with a wrong passphrase', () => {
        const base1 = buildSignatureBase(validPayload, passphrase);
        const base2 = buildSignatureBase(validPayload, 'wrongPassphrase');
        expect(md5(base1)).not.toBe(md5(base2));
    });
});
