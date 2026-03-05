import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim().replace(/\r$/, '');
    }
});

const SUPABASE_URL = env['VITE_SUPABASE_URL'] || '';
const SUPABASE_SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'] || '';

async function checkData() {
    const oRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,event_id,status,user_id&order=created_at.desc&limit=1`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    const orders = await oRes.json();
    console.log("Latest Order:", orders);

    if (orders.length > 0) {
        const dbUrl = `${SUPABASE_URL}/rest/v1/order_items?select=tickets(id,public_id,ticket_types(name),metadata)&order_id=eq.${orders[0].id}`;
        const oiRes = await fetch(dbUrl, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        const orderItems = await oiRes.json();
        console.log("Order Items Join Result:", JSON.stringify(orderItems, null, 2));

        const tickets = orderItems.map((item) => item.tickets).filter(Boolean);
        console.log("Mapped Tickets:", JSON.stringify(tickets, null, 2));
    }
}
checkData();
