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
    console.log("Fetching event with ID: d4163530-f5e1-4556-b27b-bc60e35562e7");

    const eRes = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.d4163530-f5e1-4556-b27b-bc60e35562e7&select=title,starts_at,venue,image_url`, {
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Accept': 'application/vnd.pgrst.object+json' // single() behavior
        }
    });

    const eventOutput = await eRes.text();
    console.log("Event Output:", eventOutput);
}

checkData();
