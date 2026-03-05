// test-email.ts
import "https://deno.land/x/dotenv/load.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const PDF_MONKEY_API_KEY = Deno.env.get('PDF_MONKEY_API_KEY') || ''
const PDF_MONKEY_TEMPLATE_ID = Deno.env.get('PDF_MONKEY_TEMPLATE_ID') || ''

console.log("Keys loaded:");
console.log("Resend:", RESEND_API_KEY ? "Present" : "Missing")
console.log("PDFMonkey:", PDF_MONKEY_API_KEY ? "Present" : "Missing")
console.log("Template:", PDF_MONKEY_TEMPLATE_ID)

async function testPdfMonkey() {
    console.log("Testing PDFMonkey...");
    const pdfData = {
        document: {
            document_template_id: PDF_MONKEY_TEMPLATE_ID,
            status: 'pending',
            payload: {
                event_name: "Test Event",
                event_date: "DEC 16, 2026",
                event_venue: "Camps Bay Beach",
                ticket_id: "tkt_12345",
                ticket_id_short: "12345678",
                ticket_tier: "VIP",
                attendee_name: "Local Tester",
                gate_name: "VIP Gate A"
            }
        }
    };

    const pdfRes = await fetch("https://api.pdfmonkey.io/api/v1/documents", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PDF_MONKEY_API_KEY}`
        },
        body: JSON.stringify(pdfData)
    });

    if (!pdfRes.ok) {
        console.error("PDFMonkey Error:", await pdfRes.text());
        return null;
    }

    const { document } = await pdfRes.json();
    console.log("PDFMonkey Document created with ID:", document.id);
    return document.id;
}

testPdfMonkey();
