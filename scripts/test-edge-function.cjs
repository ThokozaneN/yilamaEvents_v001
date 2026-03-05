// test-edge-function.js
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// We need an actual order ID to test with so the function can fetch tickets.
// I will query the database for the most recent confirmed order.
async function fetchLatestOrder() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?status=eq.confirmed&select=id,user_id,event_id&order=created_at.desc&limit=1`, {
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

    console.log("Triggering Edge Function...");
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
    console.log("Result:", result);
}

triggerEdgeFunction();
