# Backend Setup — Yilama Events
*Last updated: 2026-02-23*

> **Quick start for a fresh deployment:** Run `yilama_events_master_schema_v2.sql` in the Supabase SQL Editor instead of individual files. Then run `database/46_production_audit_patch.sql` on top.

---

## 1. Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) → Create a new project.
2. Copy your **Project URL** and **Anon (public) Key** from **Project Settings → API**.
3. Add them to `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   VITE_GEMINI_API_KEY=your_gemini_key
   VITE_SENTRY_DSN=your_sentry_dsn          # optional but recommended
   VITE_PAYFAST_ENVIRONMENT=sandbox          # change to "production" when live
   ```

---

## 2. Authentication Configuration

In **Supabase Dashboard → Authentication → Settings**:

| Setting | Value |
|---|---|
| **Confirm email** | ✅ ON |
| **Secure change email** | ✅ ON |
| **Minimum password length** | 8 |

---

## 3. Database Vault (for Edge Function Secrets)

Run this once in the **Supabase SQL Editor** to allow DB triggers to call Edge Functions:

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

SELECT vault.create_secret(
  'your_actual_anon_key_here',
  'anon_key',
  'Supabase Anon Key for Edge Function invocations'
);
```

---

## 4. SQL Migration Scripts

For a fresh deployment or to reset your environment, run the **Master Schema** file below. It consolidates all historical migrations (01→81) into a single definitive state.

### 4.1 Master Schema (Consolidated)

Run this file **once** in the Supabase SQL Editor:
```
database/master_schema.sql
```

This file sets up:
1.  **Foundations**: Enums, Types, and Extensions (`uuid-ossp`, `pgcrypto`, `pg_net`).
2.  **Core Tables**: Profiles, Events, Ticketing, Orders, and Financial Ledger.
3.  **Advanced Features**: Seating Layouts, Experiences, Waitlists, and Notifications.
4.  **Security**: Hardened RPCs, Security Definer Auth triggers, and RLS policies.
5.  **Seed Data**: Pricing Plans and Event Categories.

### 4.2 Incremental Migrations

If you are already running an existing database and only need Newest fixes:
1. Use the **Migration Runner** (recommended) to apply only what's missing:
   ```powershell
   .\scripts\run-migrations.ps1
   ```
2. Or run individual missing files from `database/` in numerical order.

---

### 4.3 Production Audit Patch (Always Run Last)

### 4.2 Production Audit Patch (Always Run Last)

```
database/46_production_audit_patch.sql
```

Idempotently adds:
- `ticket_types.access_rules` JSONB column (if not already deployed by Step 40)
- `ticket_checkins.scan_zone` TEXT column
- `events.fee_preference` TEXT column (`upfront` | `post_event`)

Safe to run multiple times.

### 4.3 Scanner Security Patch

```
database/patch_v42_production_scanner_security.sql
```

Hardens scanner authentication — locks down `event_scanners` RLS to only allow self-queries.

---

## 5. Edge Functions

### 5.1 Set Secrets First

In **Supabase Dashboard → Edge Functions → Secrets**, add:

| Secret | Description |
|---|---|
| `PAYFAST_MERCHANT_ID` | `10046159` (sandbox) or your real ID |
| `PAYFAST_MERCHANT_KEY` | `b55bo71117emk` (sandbox) or your real key |
| `PAYFAST_PASSPHRASE` | Your PayFast passphrase |
| `PAYFAST_ENVIRONMENT` | `sandbox` → `production` when live |
| `SUPABASE_URL` | Your full project URL (e.g., `https://xyz.supabase.co`) — **Critical for PayFast ITN flow** |
| `SUPABASE_ANON_KEY` | Your project's anon_key or service_role key |
| `API_KEY` | Your Gemini AI API key |
| `SENTRY_DSN` | Your Sentry DSN (optional) |

### 5.2 Deploy Functions

Using the Supabase CLI:

```bash
# Authenticate
npx supabase login
npx supabase link --project-ref your_project_ref

# Ticket Payment Flow (critical — enables real PayFast payments)
npx supabase functions deploy create-ticket-checkout
npx supabase functions deploy payfast-itn --no-verify-jwt

# Subscription Billing
npx supabase functions deploy create-billing-checkout
npx supabase functions deploy payfast-webhook --no-verify-jwt

# Refunds
npx supabase functions deploy process-refund

# Organizer Verification Notifications
npx supabase functions deploy notify-missing-docs --no-verify-jwt
npx supabase functions deploy notify-verification-result --no-verify-jwt

# AI Revenue Engine
npx supabase functions deploy ai-assistant

# Scanner Lifecycle management
npx supabase functions deploy create-scanner --no-verify-jwt
npx supabase functions deploy cleanup-scanners --no-verify-jwt

# Background Utilities
npx supabase functions deploy cron-dynamic-pricing --no-verify-jwt
npx supabase functions deploy cron-release-reservations --no-verify-jwt
```

### 5.3 PayFast ITN Webhook URL

Register this URL in your **PayFast Merchant Dashboard → Notifications**:
```
https://zghbrmggqvkfwatppntv.supabase.co/functions/v1/payfast-itn
```

---

## 6. Storage Bucket Verification

After running `09_storage_buckets.sql`, confirm these buckets exist in **Supabase → Storage**:

| Bucket | Visibility | Purpose |
|---|---|---|
| `event-images` | Public | Event cover artwork uploaded via wizard |
| `event-posters` | Public | Legacy event poster storage |
| `verification-docs` | **Private** | Organizer ID & proof documents |

---

## 7. Admin Account Setup

Grant yourself full admin access via the **Supabase SQL Editor**:

```sql
UPDATE public.profiles
SET
  role = 'admin',
  organizer_status = 'verified',
  organizer_tier = 'premium'
WHERE email = 'your-email@example.com';
```

> [!TIP]
> If you need to manually verify your email without clicking a link, run:
> `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'your-email@example.com';`

---

## 8. Real-time Configuration

Enable Realtime on the `notifications` table in **Supabase → Database → Replication**:

1. Find the `notifications` table row
2. Toggle **Realtime** to ON

This allows the app to receive instant notification badge updates instead of polling.

---

## 9. Production Readiness Checklist

### 🔴 Must Complete Before Launch
- [ ] Run the full SQL migration (Steps 4.1 + 4.2 + 4.3)
- [ ] Deploy all Edge Functions (Step 5.2)
- [ ] Set `PAYFAST_ENVIRONMENT=production` and real merchant credentials
- [ ] Register PayFast ITN URL in merchant dashboard
- [ ] Set `VITE_SENTRY_DSN` in `.env.local`
- [ ] Enable Realtime on `notifications` table

### 🟠 Before Scaling
- [ ] Run `npm audit fix` to address dependency vulnerabilities
- [ ] Configure custom SMTP in Supabase for transactional emails
- [ ] Enable Supabase's built-in rate limiting on auth endpoints
- [ ] Set up a Sentry project and configure alert rules for payment errors

### 🟡 Post-Launch
- [ ] Monitor `audit_logs` table for suspicious activity
- [ ] Set up `cron-dynamic-pricing` function schedule in Supabase Cron
- [ ] Review and tighten CORS origins in Edge Functions from `*` to your production domain