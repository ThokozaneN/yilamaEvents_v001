import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

serve(async (req) => {
    try {
        const payload = await req.json()
        const emailTo = payload.email || 'dev@thokozane.co.za'

        const emailHtml = `<h1>Yilama Events Diagnostic</h1><p>Check if Resend works directly.</p>`

        console.log(`Sending test email to ${emailTo}`);

        const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Yilama Events <dev@thokozane.co.za>',
                to: emailTo,
                subject: `Yilama Diagnostic Test`,
                html: emailHtml
            })
        });

        const status = resendRes.status;
        const text = await resendRes.text();

        console.log("Resend API Result:", status, text);

        return new Response(JSON.stringify({ status, text }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (err: any) {
        console.error("Test function error:", err)
        return new Response(err.message, { status: 500 })
    }
})
