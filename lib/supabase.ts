import { createClient } from '@supabase/supabase-js';

/**
 * YILAMA EVENTS: DATABASE CONFIGURATION
 */

// Read directly from Vite's import.meta.env — this is the ONLY correct way in a Vite app.
// process.env does NOT work in Vite browser builds.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Runtime validation - fail fast with a clear error if misconfigured
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'CRITICAL: Supabase credentials not configured.\n' +
    'Create .env.local file with:\n' +
    'VITE_SUPABASE_URL=your_supabase_url\n' +
    'VITE_SUPABASE_ANON_KEY=your_supabase_anon_key'
  );
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});