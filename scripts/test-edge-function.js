import fs from 'fs';

// Read .env.local manually to avoid any dotenv/module issues
const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim().replace(/\r$/, '');
    }
});

const SUPABASE_URL = env['VITE_SUPABASE_URL'] || '';
const SUPABASE_ANON_KEY = env['VITE_SUPABASE_ANON_KEY'] || '';

async function fetchLatestOrder() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,user_id,event_id&order=created_at.desc&limit=1`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });

    if (!res.ok) {
        console.error("Failed to fetch order:", await res.text());
        return null;
    }
    const data = await res.json();
    return data[0];
}

async function triggerEdgeFunction() {
    const order = await fetchLatestOrder();
    if (!order) {
        console.error("No confirmed orders found to test with.");
        return;
    }

    console.log("Found order:", order.id);

    // Construct the payload exactly as the Database Webhook would send it
    const payload = {
        type: 'UPDATE',
        table: 'orders',
        schema: 'public',
        record: order,
        old_record: { ...order, status: 'pending' }
    };

    console.log("Triggering Edge Function via JS HTTP fetch...");
    const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload)
    });

    console.log("Edge Function Response Status:", fnRes.status);
    const result = await fnRes.text();
    console.log("Response Body:", result);
}

triggerEdgeFunction();
