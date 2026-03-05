import * as postgres from "https://deno.land/x/postgres@v0.19.3/mod.ts";

Deno.serve(async (req) => {
  try {
    const pool = new postgres.Pool(Deno.env.get("SUPABASE_DB_URL"), 3, true);
    const connection = await pool.connect();
    try {
      const result = await connection.queryObject`
                SELECT event_object_table AS table_name, trigger_name, action_statement 
                FROM information_schema.triggers 
                WHERE event_object_table IN ('orders', 'payments', 'tickets', 'ticket_types', 'order_items')
            `;
      return new Response(JSON.stringify(result.rows), {
        headers: { 'Content-Type': 'application/json' }
      });
    } finally {
      connection.release();
    }
  } catch (err) {
    return new Response(String(err?.message ?? err), { status: 500 });
  }
});
