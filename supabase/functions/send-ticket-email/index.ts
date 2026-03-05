import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const PDF_MONKEY_API_KEY = Deno.env.get('PDF_MONKEY_API_KEY') || ''
const PDF_MONKEY_TEMPLATE_ID = Deno.env.get('PDF_MONKEY_TEMPLATE_ID') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  // This function is called by a database webhook, not by browsers — no CORS needed.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  // Note: Background invocation from Supabase pg_net uses a custom header, e.g. 'x-supabase-webhook-source'.
  // We'll keep the secret guard. If this is a background invocation, we'll bypass the quick return.
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  const incomingSecret = req.headers.get('x-webhook-secret')
  const isBackground = req.headers.get('x-background-worker') === 'true'

  if (!webhookSecret || incomingSecret !== webhookSecret) {
    console.error('[send-ticket-email] Unauthorized: missing or invalid x-webhook-secret')
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const payload = await req.json()
    // payload: { type: 'INSERT', table: 'orders', record: { id, user_id, event_id... } }

    const order = payload.record;
    if (!order) {
      return new Response(JSON.stringify({ error: 'No order record found' }), { status: 400 })
    }

    // 1. Fetch Ticket details via order_items
    const { data: orderItems, error: tErr } = await supabase
      .from('order_items')
      .select(`
        tickets (
          id,
          public_id,
          ticket_types ( name ),
          metadata
        )
      `)
      .eq('order_id', order.id)

    if (tErr) {
      console.error("DB Error fetching order_items:", tErr);
      throw new Error(`DB Error fetching order_items: ${tErr.message}`);
    }
    if (!orderItems || orderItems.length === 0) {
      throw new Error("Could not find order_items for order: " + order.id)
    }

    const tickets = orderItems.map((item: any) => item.tickets).filter(Boolean);
    if (!tickets.length) {
      throw new Error("Could not find underlying tickets for order: " + order.id)
    }

    const { data: event, error: eErr } = await supabase
      .from('events')
      .select('title, starts_at, venue, image_url')
      .eq('id', order.event_id)
      .single()

    if (eErr || !event) {
      console.error("Event Lookup Failed. Error:", eErr, "Order Event ID:", order.event_id);
      throw new Error(`Could not find event with ID ${order.event_id}. DB Error: ${JSON.stringify(eErr)}`)
    }

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', order.user_id)
      .single()

    if (pErr || !profile) throw new Error("Could not find user profile")

    if (!profile.email) {
      throw new Error("User has no email address")
    }

    console.log(`Preparing to send tickets to ${profile.email} for order ${order.id}`)

    // ── ASYNC NON-BLOCKING PATTERN ─────────────────────────────────────────
    // Return early to postgres webhook, then continue Execution in background.

    // We immediately construct and return the response to Postgres to free up the DB worker.
    // Deno edge runtime allows code to continue executing after the response is returned
    // as long as the Promise is awaited or handled internally without throwing top-level exceptions.

    const response = new Response(JSON.stringify({ success: true, message: 'Processing PDF generation' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 202
    });

    // Defer the heavy PDF and Email work
    const processEmail = async () => {
      console.log(`[Worker] Started async generation for order ${order.id}`);

      const generatedPdfs = [];

      // 2. Generate PDF via PDFMonkey for each ticket
      for (const ticket of tickets) {
        const ticketTier = ticket.ticket_types ? ticket.ticket_types.name : 'GENERAL'
        const dateStr = new Date(event.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

        const attendeeName = ticket.metadata?.attendee_name || profile.name || 'Attendee'

        const pdfData = {
          document: {
            document_template_id: PDF_MONKEY_TEMPLATE_ID,
            status: 'pending',
            payload: {
              event_name: event.title,
              event_date: dateStr,
              event_venue: event.venue || 'TBA',
              event_image: event.image_url || 'https://images.unsplash.com/photo-1540039155732-684735035726?auto=format&fit=crop&w=400&q=80',
              ticket_id: ticket.public_id, // CRITICAL: Use public_id to match App Wallet scanner
              ticket_id_short: ticket.public_id?.slice(0, 8),
              ticket_tier: ticketTier,
              attendee_name: attendeeName,
              gate_name: "Main Gate" // TODO: Add dynamic gate distribution logic later
            }
          }
        }

        // Start PDF Generation
        const pdfRes = await fetch("https://api.pdfmonkey.io/api/v1/documents", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PDF_MONKEY_API_KEY}`
          },
          body: JSON.stringify(pdfData)
        })

        if (!pdfRes.ok) {
          const errText = await pdfRes.text();
          console.error(`[PDFMonkey] Failed to start generation for ticket ${ticket.id}. Status: ${pdfRes.status}. Message:`, errText);
          continue; // Skip this ticket but try others
        }

        const pdfJson = await pdfRes.json();
        console.log(`[PDFMonkey] Started generation successfully. Document ID: ${pdfJson.document.id}`);
        const documentId = pdfJson.document.id;

        let fileUrl = null;
        let retries = 0;

        // Poll until generation is complete
        while (!fileUrl && retries < 10) {
          await new Promise(r => setTimeout(r, 1500)); // wait 1.5s
          const checkRes = await fetch(`https://api.pdfmonkey.io/api/v1/documents/${documentId}`, {
            headers: { 'Authorization': `Bearer ${PDF_MONKEY_API_KEY}` }
          })
          const checkJson = await checkRes.json();
          if (checkJson.document.status === 'success') {
            fileUrl = checkJson.document.download_url;
          }
          retries++;
        }

        if (fileUrl) {
          // Download the PDF
          const fileFetch = await fetch(fileUrl);
          if (fileFetch.ok) {
            console.log(`[PDFMonkey] Successfully downloaded PDF for ${documentId}. Encoding...`);
            const buffer = await fileFetch.arrayBuffer();

            // Fast Base64 encoding without blowing up call stack or string concatenation
            const bytes = new Uint8Array(buffer);
            // 8KB chunks to prevent Maximum Call Stack Size Exceeded
            const CHUNK_SIZE = 8192;
            let binary = '';
            for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
              const chunk = bytes.slice(i, i + CHUNK_SIZE);
              binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            const base64Str = btoa(binary);

            generatedPdfs.push({
              filename: `${event.title.replace(/[^a-z0-9]/gi, '_')}_Ticket_${ticket.public_id?.slice(0, 8)}.pdf`,
              content: base64Str
            });
            console.log(`[PDFMonkey] Successfully attached PDF for ticket ${ticket.id}`);
          } else {
            console.error(`[PDFMonkey] Failed to download generated PDF from ${fileUrl}. Status: ${fileFetch.status}`);
          }
        } else {
          console.error(`[PDFMonkey] Polling timed out (or failed) for Document ID ${documentId}. Ticket ${ticket.id} will not have a PDF.`);
        }
      }

      // 3. Send email with Resend
      const plural = tickets.length > 1 ? 'tickets' : 'ticket';

      // Very basic HTML template for the email body
      const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #111;">
        <h2>You're going to ${event.title}! 🎉</h2>
        <p>Hi ${profile.name?.split(' ')[0] || 'there'},</p>
        <p>Thank you for your purchase. Your ${tickets.length} ${plural} are attached to this email as PDFs.</p>
        <p>You can also view your scannable tickets anytime from the Yilama app wallet.</p>
        <a href="https://app.yilama.co.za/wallet" style="display:inline-block; padding:12px 24px; background:#111; color:#fff; text-decoration:none; border-radius:8px; font-weight:bold; margin-top:20px;">
          View in Yilama Wallet
        </a>
      </div>
    `;

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Yilama Events <dev@thokozane.co.za>',
          to: profile.email,
          subject: `Your Tickets: ${event.title}`,
          html: emailHtml,
          attachments: generatedPdfs
        })
      })

      if (!resendRes.ok) {
        console.error("Resend API failed:", await resendRes.text());
        throw new Error("Failed to send email");
      }

      const resendJson = await resendRes.json();
      console.log("Email sent successfully!", resendJson);

    };

    // Trigger the async processing without awaiting it for the main execution thread
    // Deno runtime doesn't kill the worker immediately. Edge Functions have up to 50s execution time.
    // We use a safe try-catch wrapper to avoid unhandled rejections crashing the isolate.
    processEmail().catch(e => console.error("[Worker] Deferred processing crashed", e));

    return response;

  } catch (err: any) {
    console.error(err)
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
