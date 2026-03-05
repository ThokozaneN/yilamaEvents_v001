# Deployment & Live Testing Guide — Yilama Events

This guide covers deploying the frontend to **Vercel** and testing scanners on mobile devices.

---

## 1. Deploying to Vercel

1. **Push your code to GitHub/GitLab/Bitbucket**.
2. **Connect to Vercel**:
   - Go to [Vercel](https://vercel.com) → Add New Project.
   - Import your repository.
3. **Configure Environment Variables**:
   In Vercel Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
   - `VITE_PAYFAST_ENVIRONMENT` (Set to `production` or `sandbox`)
4. **Deploy**: Vercel will automatically build and deploy your React app.

> **Note on API Exposure**: Since this is a Vite app, your Supabase URL and Anon Key will be visible in the browser's Network tab. This is **standard and safe** for Supabase, provided your **RLS (Row Level Security)** policies are correctly configured.

---

## 2. Live Testing (Mobile Scanner)

To test the scanner feature live (camera access), you must use an **HTTPS** connection. Vercel provides this by default.

1. **Create an Event**: Use the Organizer Dashboard to create an event starting soon.
2. **Add a Scanner**:
   - Go to the **Team** tab.
   - Generate scanner credentials (ensure the event is within the 48-hour creation window).
3. **Login as Scanner on Mobile**:
   - Open your Vercel URL on a physical phone.
   - Sign in using the generated scanner email/password.
4. **Scan a Ticket**:
   - Open the "Scanner" view.
   - Grant camera permissions.
   - Scan a valid ticket QR code.

---

## 3. Security Hardening (Post-Testing)

Once live testing is complete and you are moving to a production environment:

1. **Rotate Secrets**: If you suspect your Anon key was shared insecurely, rotate it in the Supabase Dashboard.
2. **Tighten CORS**:
   In your Supabase Edge Functions (`corsHeaders`), restrict `Access-Control-Allow-Origin` to your specific Vercel domain instead of `*`.
   ```ts
   'Access-Control-Allow-Origin': 'https://your-app.vercel.app'
   ```
3. **Admin Controls**: Ensure only verified organizers can create events and scanners.
4. **Database Audit**: Review `audit_logs` to ensure no unauthorized RPC calls are happening.

---

## 4. Known Environment Differences

| Feature | Localhost | Live (Vercel) |
|---|---|---|
| **Camera Access** | Works on Chrome (local bypass) | Requires HTTPS |
| **PayFast ITN** | Needs Ngrok to receive webhooks | Works natively with your Supabase Function URL |
| **SSO / Social Auth** | Redirects to localhost | Must update Redirect URLs in Supabase Auth |
