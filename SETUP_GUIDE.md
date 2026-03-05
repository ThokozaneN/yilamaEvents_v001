# Full App Setup Guide — Yilama Events

Follow these steps to set up the entire Yilama Events platform from scratch.

---

## Prerequisites

- **Node.js**: v18+ 
- **Supabase Account**: [Sign up here](https://supabase.com)
- **Supabase CLI**: `npm install supabase --save-dev`
- **Git**: For cloning the repository

---

## Step 1: Frontend Configuration

1. **Clone the repository** (if you haven't).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Environment Variables**:
   Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```
   Required keys:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY` (Get from Google AI Studio)

---

## Step 2: Database Setup

1. **Create a Supabase Project**.
2. **Apply Migrations**:
   Go to the **Supabase Dashboard → SQL Editor**.
   - If starting fresh: Run `yilama_events_master_schema_v2.sql`.
   - **Critical Fixes**: Run these specifically if they aren't in your master script:
     - `database/72_hotfix_restore_safe_auth_trigger.sql` (Fixes signup 500 errors)
     - `database/73_add_reserved_to_ticket_status.sql` (Fixes checkout "invalid enum" error)
     - `database/71_scanner_auto_cleanup.sql` (Enables pg_cron for scanner cleanup)

3. **Authentication Settings**:
   In **Supabase → Auth → Settings**:
   - Enable "Confirm Email".
   - Set "Minimum password length" to 8.

---

## Step 3: Edge Functions Deployment

1. **Link your project**:
   ```bash
   npx supabase login
   npx supabase link --project-ref your_project_ref
   ```
2. **Set Secrets**:
   Go to **Supabase Dashboard → Settings → API** and copy your `service_role` key. Use it to set function secrets (see `EDGE_FUNCTIONS.md` for the full list):
   ```bash
   npx supabase secrets set PAYFAST_MERCHANT_ID=...
   npx supabase secrets set PAYFAST_MERCHANT_KEY=...
   npx supabase secrets set PAYFAST_PASSPHRASE=...
   npx supabase secrets set GEMINI_API_KEY=...
   ```
3. **Deploy Functions**:
   ```bash
   npx supabase functions deploy create-ticket-checkout
   npx supabase functions deploy create-scanner --no-verify-jwt
   npx supabase functions deploy cleanup-scanners --no-verify-jwt
   # ... deploy others as needed
   ```

---

## Step 4: Storage & Realtime

1. **Check Buckets**: Ensure `event-images` (public) and `verification-docs` (private) exist in Supabase Storage.
2. **Enable Realtime**: Go to **Database → Replication** and enable Realtime for the `notifications` table.

---

## Step 5: Run the App

```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Common Gotchas

- **Signup fails with 500?** Ensure you ran migration `72`.
- **Checkout fails with "invalid enum"?** Ensure you ran migration `73`.
- **Scanner camera doesn't open?** Scanners only activate 3 hours before an event start. Check the event dates in the dashboard.
