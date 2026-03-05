import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { AUTHORIZED_STAMP_B64 } from "./constants.ts"

const PDF_MONKEY_API_KEY = Deno.env.get('PDF_MONKEY_API_KEY') || ''
const PDF_MONKEY_FINANCE_TEMPLATE_ID = Deno.env.get('PDF_MONKEY_FINANCE_TEMPLATE_ID') || '' // New template needed
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const isAllowedOrigin = (origin: string | null): boolean => {
    if (!origin) return false;
    if (origin === 'https://app.yilama.co.za') return true;
    if (origin === 'https://yilama.co.za') return true;
    if (origin.startsWith('http://localhost:')) return true;
    if (origin.endsWith('.vercel.app')) return true;
    return false;
};

const corsHeaders = (reqOrigin: string | null): Record<string, string> => ({
    'Access-Control-Allow-Origin': isAllowedOrigin(reqOrigin) ? reqOrigin! : 'https://app.yilama.co.za',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin')) })
    }

    try {
        const { organizer_id, start_date, end_date } = await req.json()

        if (!PDF_MONKEY_FINANCE_TEMPLATE_ID) {
            throw new Error("PDF_MONKEY_FINANCE_TEMPLATE_ID is not configured in Edge Function secrets.")
        }

        if (!organizer_id) {
            throw new Error("Missing organizer_id in request.")
        }

        // 1. Fetch Financial Summary from DB
        const { data: summary, error: rpcError } = await supabase.rpc('get_organizer_financial_summary', {
            p_organizer_id: organizer_id,
            p_start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            p_end_date: end_date || new Date().toISOString()
        })

        if (rpcError || !summary) {
            throw new Error("Failed to fetch financial summary: " + (rpcError?.message || "No data"))
        }

        // 2. Prepare Payload for PDFMonkey
        // We format amounts for display
        const payload = {
            template_id: PDF_MONKEY_FINANCE_TEMPLATE_ID,
            document: {
                document_template_id: PDF_MONKEY_FINANCE_TEMPLATE_ID,
                status: 'pending',
                payload: {
                    organizer_name: summary.metadata.organizer_name,
                    organizer_tier: summary.metadata.organizer_tier,
                    period_start: new Date(summary.metadata.period_start).toLocaleDateString('en-ZA'),
                    period_end: new Date(summary.metadata.period_end).toLocaleDateString('en-ZA'),
                    generated_at: new Date(summary.metadata.generated_at).toLocaleString('en-ZA'),

                    gross_sales: summary.metrics.gross_sales.toFixed(2),
                    total_refunds: summary.metrics.total_refunds.toFixed(2),
                    platform_fees: summary.metrics.platform_fees.toFixed(2),
                    tier_deductions: summary.metrics.tier_deductions.toFixed(2),
                    net_payouts: summary.metrics.net_payouts.toFixed(2),
                    opening_balance: summary.metrics.opening_balance.toFixed(2),
                    closing_balance: summary.metrics.closing_balance.toFixed(2),
                    net_change: summary.metrics.net_change.toFixed(2),

                    transactions: (summary.transactions || []).map((tx: any) => ({
                        date: new Date(tx.created_at).toLocaleDateString('en-ZA'),
                        description: tx.description,
                        category: tx.category.replace('_', ' ').toUpperCase(),
                        amount: (tx.type === 'credit' ? '' : '-') + tx.amount.toFixed(2),
                        type: tx.type
                    })),

                    // Authorized Stamp via Base64
                    stamp_url: AUTHORIZED_STAMP_B64
                }
            }
        }

        // 3. Call PDFMonkey
        const pdfRes = await fetch("https://api.pdfmonkey.io/api/v1/documents", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PDF_MONKEY_API_KEY}`
            },
            body: JSON.stringify(payload)
        })

        if (!pdfRes.ok) {
            const errorText = await pdfRes.text();
            console.error("PDFMonkey failed:", errorText);
            throw new Error("PDF Generation Service failed");
        }

        const pdfJson = await pdfRes.json();
        const documentId = pdfJson.document.id;

        // 4. Poll for PDF completion (Max 15 seconds)
        let downloadUrl = null;
        let attempts = 0;
        while (!downloadUrl && attempts < 10) {
            await new Promise(r => setTimeout(r, 1500));
            const checkRes = await fetch(`https://api.pdfmonkey.io/api/v1/documents/${documentId}`, {
                headers: { 'Authorization': `Bearer ${PDF_MONKEY_API_KEY}` }
            })
            const checkJson = await checkRes.json();
            if (checkJson.document.status === 'success') {
                downloadUrl = checkJson.document.download_url;
            }
            attempts++;
        }

        if (!downloadUrl) {
            throw new Error("PDF generation timed out");
        }

        return new Response(JSON.stringify({ url: downloadUrl }), {
            headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        })

    } catch (err: any) {
        console.error(err)
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
