require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Checking billing_payments...");
    const { data: payments, error: err1 } = await supabase
        .from('billing_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    console.log("Payments Error:", err1);
    console.log("Recent Payments:", payments);

    console.log("\nChecking subscriptions...");
    const { data: subs, error: err2 } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
    console.log("Subscriptions Error:", err2);
    console.log("Recent Subs:", subs);
}

run();
