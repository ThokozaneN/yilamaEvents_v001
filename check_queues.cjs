const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkPendingEmails() {
    try {
        const env = fs.readFileSync('.env.local', 'utf8');
        const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();

        let envTemp = '';
        try {
            envTemp = fs.readFileSync('.env.temp', 'utf16le');
        } catch (e) {
            envTemp = fs.readFileSync('.env.temp', 'utf8');
        }

        const serviceKeyMatch = envTemp.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
        if (!serviceKeyMatch) {
            console.error("Could not find service key in .env.temp!");
            return;
        }
        const serviceKey = serviceKeyMatch[1].trim();

        const supabase = createClient(supabaseUrl, serviceKey);

        console.log("Checking pending_ticket_emails...");
        const { data, error } = await supabase.from('pending_ticket_emails').select('*');
        if (error) throw error;

        console.log(`Found ${data.length} pending emails.`);
        if (data.length > 0) {
            console.log(JSON.stringify(data.slice(0, 3), null, 2));
        }

        console.log("\nChecking notifications...");
        const { data: notifs, error: err2 } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
        if (err2) throw err2;

        console.log(`Found ${notifs.length} recent notifications.`);
        if (notifs.length > 0) {
            console.log(JSON.stringify(notifs, null, 2));
        }

    } catch (e) {
        console.error("Script failed:", e);
    }
}

checkPendingEmails();
