# New Supabase Project Setup — Critical Checklist

Follow this **in order**. Skipping steps causes the exact errors we spent hours debugging.

---

## Step 1: Create the New Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**.
2. Note down (you'll need these):
   - **Project URL** (e.g. `https://xxxxxxxxxxxx.supabase.co`)
   - **Anon Key** (from Project Settings → API)
   - **Service Role Key** (from Project Settings → API) — keep this secret!

---

## Step 2: Update Frontend Config

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://YOUR_NEW_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_NEW_ANON_KEY
```

Restart the dev server after saving.

---

## Step 3: Run SQL Migrations (in order)

Go to **SQL Editor** in the Dashboard and run each file **in numbered order**:

```
database/01_*.sql → database/02_*.sql → ... → database/73_*.sql
```

> **CRITICAL:** You must run `53_fix_ambiguous_purchase_tickets.sql` to drop old overloaded function versions. Without this, ticket purchases fail with "ambiguous function" error.

---

## Step 4: Set Edge Function Secrets

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-provisioned** by Supabase for each project — you cannot set them manually (Supabase blocks names starting with `SUPABASE_`). They will always match your current project.

In **Dashboard → Edge Functions → Secrets**, add ONLY the custom PayFast secrets:

| Secret | Value |
|---|---|
| `PAYFAST_MERCHANT_ID` | `10046159` |
| `PAYFAST_MERCHANT_KEY` | `b55bo71117emk` |
| `PAYFAST_PASSPHRASE` | `-YouGuessedIt116` |
| `PAYFAST_ENVIRONMENT` | `sandbox` |

Or via CLI:

```bash
npx supabase secrets set PAYFAST_MERCHANT_ID=10046159 PAYFAST_MERCHANT_KEY=b55bo71117emk PAYFAST_PASSPHRASE=-YouGuessedIt116 PAYFAST_ENVIRONMENT=sandbox --project-ref YOUR_REF
```

---

## Step 5: Deploy Edge Functions

```bash
# CRITICAL: --no-verify-jwt is REQUIRED for create-ticket-checkout
# Supabase uses ES256 JWT signing which fails gateway-level HS256 verification.
# The function handles auth internally via direct JWT parsing.

npx supabase functions deploy create-ticket-checkout --no-verify-jwt
npx supabase functions deploy payfast-itn --no-verify-jwt
npx supabase functions deploy create-billing-checkout
npx supabase functions deploy create-scanner
npx supabase functions deploy cleanup-scanners
npx supabase functions deploy send-ticket-email
npx supabase functions deploy notify-verification-result
```

---

## Step 6: Fix Database Webhook URLs

After running migrations, several database webhooks (for email + waitlist) will still point to your OLD project URL. Update them in **Database → Webhooks**:

- `send-ticket-email` webhook → `https://YOUR_NEW_REF.supabase.co/functions/v1/send-ticket-email`
- `process-waitlist` webhook → `https://YOUR_NEW_REF.supabase.co/functions/v1/process-waitlist`

---

## Step 7: Sign In & Test

1. Sign in to the app with the new credentials.
2. Create a test event.
3. Try purchasing a ticket — should redirect to PayFast sandbox.

---

## Common Pitfalls (Learned the Hard Way)

| Symptom | Cause | Fix |
|---|---|---|
| `401 Invalid JWT` on checkout | `verify_jwt = true` default incompatible with ES256 | Deploy with `--no-verify-jwt` |
| `401 Invalid JWT` on billing | Same — service role key mismatch | Fix secrets in Dashboard |
| `ambiguous function` error | Two overloaded `purchase_tickets` exist | Run `53_fix_ambiguous_purchase_tickets.sql` |
| Emails not sending | Webhook URL still points to old project | Update Database → Webhooks |
| Waitlist not processing | Same webhook URL issue | Update Database → Webhooks |
