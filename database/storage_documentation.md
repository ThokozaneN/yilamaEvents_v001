# Yilama Events - Storage Security Policies

This document details the Row Level Security (RLS) policies implemented for the `storage.objects` table within the Supabase Storage schema. These policies ensure that event media assets (specifically posters) are handled securely according to user roles.

## 1. Bucket Configuration
- **Bucket Name**: `event-posters`
- **Visibility**: Public (Required for attendees to view posters on discovery pages)

## 2. Policy Summary

| Policy Name | Access Type | Target Audience | Condition |
| :--- | :--- | :--- | :--- |
| **Posters: Public View** | SELECT | Everyone | `bucket_id = 'event-posters'` |
| **Posters: Organizer Management** | ALL | Authenticated Organizers/Admins | User role is `organizer` or `admin` AND folder name matches `auth.uid()` |
| **Posters: Admin Access** | ALL | Authenticated Admins | User role is `admin` |

---

## 3. SQL Implementation Details

### A. Public View Access
Allows any user (including unauthenticated visitors) to view event posters. This is essential for the Home and Event Detail views.

```sql
CREATE POLICY "Posters: Public View"
ON storage.objects FOR SELECT
USING ( bucket_id = 'event-posters' );
```

### B. Organizer & Admin Management (Hardened)
Restricts write operations (INSERT, UPDATE, DELETE) to users verified as Organizers or Admins in their profile. To prevent cross-organizer unauthorized deletions, we enforce that all files must be prefixed with the organizer's own unique identifier.

**Path Requirement**: `{auth.uid()}/your-poster-name.png`

```sql
CREATE POLICY "Posters: Organizer Management"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'event-posters' 
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('organizer', 'admin')
  )
)
WITH CHECK (
  bucket_id = 'event-posters'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('organizer', 'admin')
  )
);
```

### C. System Admin Override
A fallback policy ensuring that platform administrators maintain full control over all assets across all buckets for compliance and moderation purposes.

```sql
CREATE POLICY "Posters: Admin Access"
ON storage.objects FOR ALL
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
```

---

## 4. Setup Instructions
1. Navigate to the **Supabase Dashboard**.
2. Go to **Storage** and create a bucket named `event-posters`.
3. Set the bucket to **Public**.
4. Go to **SQL Editor** and run the policies above.
5. Ensure the `public.profiles` table is populated correctly, as the management policies rely on a cross-schema join to verify the user's role.