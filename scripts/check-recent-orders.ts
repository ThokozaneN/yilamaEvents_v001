import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

async function checkData() {
    const { data: orders, error: oErr } = await supabase.from('orders').select('*').limit(5).order('created_at', { ascending: false });
    console.log("Recent Orders:", orders);

    const { data: payments, error: pErr } = await supabase.from('payments').select('*').limit(5).order('created_at', { ascending: false });
    console.log("Recent Payments:", payments);
}
checkData();
