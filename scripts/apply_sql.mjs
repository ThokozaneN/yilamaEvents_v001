import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://bvjcvdnfoqmxzdflqsdp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
    console.error("Missing Service Role Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    try {
        const file = process.argv[2];
        if (!file) throw new Error("No SQL file provided");

        const sql = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');

        // Using postgres meta API if enabled, or a generic rpc
        const { error } = await supabase.rpc('exec_sql', { query: sql });

        if (error) {
            console.log("RPC Method failed, trying direct postgres connection if possible...");
            console.error(error);
        } else {
            console.log(`Executed ${file} successfully.`);
        }
    } catch (e) {
        console.error("Execution failed", e);
    }
}

runSQL();
