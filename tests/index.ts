import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
// Fix: Always use the standard import as per guidelines
import { GoogleGenAI } from "@google/genai";

// Fix: Replace Deno.env with process.env check to resolve "Cannot find name 'Deno'" errors
const SUPABASE_URL = (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') || '';
const SUPABASE_SERVICE_ROLE_KEY = (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : '') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const checks: any = {
    database: { status: 'pending' },
    storage: { status: 'pending' },
    ai_engine: { status: 'pending' },
    timestamp: new Date().toISOString()
  };

  try {
    const { error: dbError } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
    checks.database = dbError ? { status: 'error', message: dbError.message } : { status: 'ok' };

    const { error: storageError } = await supabase.storage.getBucket('event-posters');
    checks.storage = storageError ? { status: 'error', message: storageError.message } : { status: 'ok' };

    try {
      // Fix: Follow guidelines for initialization using process.env.API_KEY directly
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "ping",
        config: {
          maxOutputTokens: 5,
          // Fix: Ensure thinkingBudget is set correctly when maxOutputTokens is used
          thinkingConfig: { thinkingBudget: 0 }
        }
      });
      // Fix: Access .text as a property (not a method) as per guidelines
      checks.ai_engine = response.text ? { status: 'ok' } : { status: 'degraded' };
    } catch (aiErr: any) {
      checks.ai_engine = { status: 'error', message: aiErr.message };
    }

    const isHealthy = Object.values(checks).every((c: any) => typeof c !== 'object' || c.status === 'ok');

    return new Response(
      JSON.stringify({
        healthy: isHealthy,
        version: "1.2.1-PROD",
        checks
      }),
      {
        status: isHealthy ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ healthy: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})