
# Yilama Events: CORS Security Policy

To prevent unauthorized cross-origin access and mitigate CSRF risks, the following configuration must be applied in the Supabase Dashboard.

## 1. Global API CORS Settings
Navigate to **Project Settings** -> **API** -> **CORS Settings**.

- **Allowed Origins**: 
  - `https://yilamaevents.co.za` (Production)
  - `https://*.yilamaevents.co.za` (Subdomains)
  - `http://localhost:5173` (Development - remove in final hardening)
- **Max Age**: `600`
- **Allow Credentials**: `true`

## 2. Edge Function Headers
All Edge Functions must handle the `OPTIONS` preflight request and return appropriate headers.

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://yilamaevents.co.za',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

## 3. Storage Bucket Policy
Ensure the `event-posters` bucket visibility is set to **Public** for image serving, but restricted via RLS for management (already covered in `storage_policies.sql`).
