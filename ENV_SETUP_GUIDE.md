# Yilama Events - Environment Setup Guide

## Required Environment Variables

This application requires environment variables to be configured for secure operation. **Never commit actual credentials to version control.**

### Local Development Setup

1. Create a `.env.local` file in the project root:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional: Sentry Error Monitoring
VITE_SENTRY_DSN=your_sentry_dsn
```

2. Get your Supabase credentials:
   - Go to your Supabase project dashboard
   - Navigate to **Settings** → **API**
   - Copy the **Project URL** and **anon/public** key

### Supabase Edge Function Setup

The application uses server-side Edge Functions to protect API keys. You need to configure the Gemini AI API key as a Supabase secret:

```bash
# Navigate to your project directory
cd c:\dev\yilamaEvents_v001

# Set the Gemini API key as a Supabase secret
npx supabase secrets set GEMINI_API_KEY=your_actual_gemini_api_key
```

**Get your Gemini API key:**
- Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
- Create or copy your API key
- Use it in the command above

### Deploying Edge Functions

After creating the `ai-assistant` edge function, deploy it:

```bash
# Login to Supabase (if not already logged in)
npx supabase login

# Link your project (if not already linked)
npx supabase link --project-ref your_project_ref

# Deploy the edge function
npx supabase functions deploy ai-assistant
```

### Testing Edge Function Locally

```bash
# Start Supabase locally with functions
npx supabase functions serve

# Test the function
curl -i --location --request POST 'http://localhost:54321/functions/v1/ai-assistant' \
  --header 'Content-Type: application/json' \
  --data '{"type":"venue","input":"Sandton Convention Centre"}'
```

## Security Checklist

- [ ] ✅ `.env.local` file created with your credentials
- [ ] ✅ `.env.local` is in `.gitignore` (verified: `*.local` pattern covers it)
- [ ] ✅ Supabase anon key rotated (if old key was committed to Git)
- [ ] ✅ `GEMINI_API_KEY` set as Supabase secret
- [ ] ✅ Edge function `ai-assistant` deployed
- [ ] ⚠️ **IMPORTANT**: Never commit actual credentials to version control

## Rotating Credentials (If Exposed)

If your Supabase credentials were committed to Git:

1. **Rotate Anon Key:**
   - Go to Supabase Dashboard → Settings → API
   - Click "Generate new anon key"
   - Update `.env.local` with new key
   - Redeploy your application

2. **Rotate Gemini API Key:**
   - Go to Google AI Studio
   - Revoke old key, create new one
   - Update Supabase secret: `npx supabase secrets set GEMINI_API_KEY=new_key`
   - Redeploy edge functions

## Troubleshooting

### "CRITICAL: Supabase credentials not configured"
- Ensure `.env.local` exists in project root
- Verify variables start with `VITE_` prefix
- Restart dev server after creating/updating `.env.local`

### "AI service not configured"
- Verify Gemini API key is set: `npx supabase secrets list`
- Redeploy edge function after setting secrets
- Check edge function logs: `npx supabase functions logs ai-assistant`

### Edge Function Not Working
- Ensure function is deployed: `npx supabase functions list`
- Check CORS settings in function response headers
- Verify Supabase URL in `.env.local` is correct

## Additional Resources

- [Supabase Environment Variables](https://supabase.com/docs/guides/cli/managing-environments)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
