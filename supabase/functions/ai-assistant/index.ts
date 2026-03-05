import { GoogleGenAI } from "npm:@google/generative-ai@0.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI Assistant Edge Function
 * Handles AI operations server-side to protect API keys.
 * Requires a valid user JWT — anonymous calls are rejected.
 *
 * Endpoints:
 * - type: 'art'   - Audit poster/artwork quality
 * - type: 'venue' - Get venue capacity and tips
 * - type: 'marketing' / 'pricing' / 'sales' - Revenue engine features
 */

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

Deno.serve(async (req) => {
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(origin) });
    }

    try {
        // ── SECURITY: Require a valid user JWT ─────────────────────────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized', message: 'Missing Authorization header.' }),
                { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authErr } = await userClient.auth.getUser();
        if (authErr || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized', message: 'Invalid or expired session.' }),
                { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // ── Parse request ─────────────────────────────────────────────────────
        const { type, input, context } = await req.json();

        if (!type || !input) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: type and input' }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Get API key from environment
        const apiKey = Deno.env.get('GEMINI_API_KEY');
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured in Supabase secrets');
            return new Response(
                JSON.stringify({ error: 'AI service not configured' }),
                { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Initialize Gemini AI
        const ai = new GoogleGenAI({ apiKey });

        type AITier = 'free' | 'pro' | 'premium';
        interface AIContext {
            category: string;
            tier: AITier;
            organizerName?: string;
        }

        const SYSTEM_PROMPTS = {
            marketing: (ctx: AIContext) => {
                const base = `You are a world-class event marketing expert for Yilama Events, a premium South African event platform. Category: ${ctx.category}. Organizer: ${ctx.organizerName || 'Partner'}.`;
                if (ctx.tier === 'premium') return `${base} Task: Write a high-conversion, persuasive event description. Focus: Use "Fear Of Missing Out" (FOMO) and professional copywriting frameworks (AIDA). Style: Luxury, high-energy, and direct. Include clear calls to action. Use local South African context if relevant. Output: Markdown formatted text. Max 400 words.`;
                if (ctx.tier === 'pro') return `${base} Task: Refine this event description for clarity and vibe. Focus: Professionalism and engagement. Style: Upbeat and welcoming. Output: Markdown formatted text. Max 300 words.`;
                return `${base} Task: Clean up this event description. Focus: Correct grammar and basic structure. Output: Markdown formatted text. Max 200 words.`;
            },
            pricing: (ctx: AIContext) => {
                const base = `You are a revenue optimization expert. Category: ${ctx.category}.`;
                if (ctx.tier === 'premium') return `${base} Task: Analyze ticket tiers and provide a strategic pricing roadmap. Focus: Revenue maximization, early-bird gaps, and VIP psychology. Output: Concise bullet points.`;
                return `${base} Task: Provide basic ticket pricing ranges for this category in the South African market. Output: Concise ranges.`;
            },
            sales: (ctx: AIContext) => {
                const base = `You are a business intelligence analyst for an event platform. Organizer: ${ctx.organizerName || 'Partner'}.`;
                if (ctx.tier === 'premium') return `${base} Task: Provide predictive sales insights and high-stakes marketing recommendations. Focus: Highlighting trends early and suggesting urgent action (e.g., "Boost social spend now"). Output: Concise, actionable advice in bullet points.`;
                return `${base} Task: Provide basic sales oversight feedback. Output: A single concise insight sentence.`;
            }
        };

        // Build prompt based on type
        let prompt = '';
        if (type === 'art') {
            prompt = `Audit this event poster URL: ${input}. Provide 1 concise sentence on the visual quality and professionalism.`;
        } else if (type === 'venue') {
            prompt = `For the venue "${input}" in South Africa, provide: 1) Estimated capacity, 2) One specific pro-tip for event organizers. Keep response under 20 words total.`;
        } else if (type === 'marketing') {
            prompt = `${SYSTEM_PROMPTS.marketing(context as AIContext)}\n\nInput Description: ${input}`;
        } else if (type === 'pricing') {
            prompt = `${SYSTEM_PROMPTS.pricing(context as AIContext)}\n\nDetails: ${typeof input === 'string' ? input : JSON.stringify(input)}`;
        } else if (type === 'sales') {
            prompt = `${SYSTEM_PROMPTS.sales(context as AIContext)}\n\nSales Data Summary: ${typeof input === 'string' ? input : JSON.stringify(input)}`;
        } else {
            return new Response(
                JSON.stringify({ error: `Invalid type: ${type}` }),
                { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
            );
        }

        // Generate content — use stable model name
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt
        });

        const text = response.text || 'AI response unavailable';

        return new Response(
            JSON.stringify({ success: true, text, type }),
            { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('AI Assistant Error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: 'AI service temporarily unavailable',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});

