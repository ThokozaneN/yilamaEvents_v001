{
# Supabase CLI & Secrets Management Guide

This guide walkthroughs the process of setting up the Supabase CLI on your machine and configuring the environment secrets (API Keys) required for **Yilama Events** Edge Functions.

---

## 1. Install the Supabase CLI

The Supabase CLI is the bridge between your local machine and your hosted project.

### Via NPM (Recommended)
Open your terminal in your project root and run:
```bash
# We use --legacy-peer-deps to avoid conflicts with React 19 testing libraries
npm install supabase --save-dev --legacy-peer-deps
```

### Alternative: Windows (Scoop)
If you use Scoop:
```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

---

## 2. Authenticate the CLI

You need to link the CLI to your Supabase account.

1. Run the login command:
   ```bash
   npx supabase login
   ```
2. Your browser will open. Log in to Supabase and click **Authorize**.
3. Copy the token provided in the browser and paste it back into your terminal if prompted.

---

## 3. Link Your Project

Now, tell the CLI which specific project it should manage.

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your **Yilama Events** project.
3. Look at the URL in your browser. It looks like this:
   `https://supabase.com/dashboard/project/hjevlfzcxetrywpicmgb`
4. The string at the end (`hjevlfzcxetrywpicmgb`) is your **Project Reference ID**.
5. In your terminal, run:
   ```bash
   npx supabase link --project-ref hjevlfzcxetrywpicmgb
   ```
   *(It will ask for your Database Password. This is the password you set when you first created the project.)*

---

## 4. Adding Secrets

Secrets are encrypted environment variables stored on Supabase servers. They are used by Edge Functions.

### Set the Gemini AI Key
```bash
npx supabase secrets set API_KEY=your_gemini_api_key_here
```

### Set PayFast Credentials
```bash
npx supabase secrets set PAYFAST_PASSPHRASE=your_passphrase
npx supabase secrets set PAYFAST_MERCHANT_ID=your_id
npx supabase secrets set PAYFAST_MERCHANT_KEY=your_key
npx supabase secrets set PAYFAST_ENVIRONMENT=sandbox
```

---

## 5. Verify & Deploy

To see a list of all active secrets:
```bash
npx supabase secrets list
```

Deploy your functions to apply the new secrets:
```bash
npx supabase functions deploy --no-verify-jwt
```
