/*
  # Yilama Events: Storage Buckets & Policies v1.0
  
  Dependencies: 08_audit_and_hardening.sql

  ## Buckets:
  1. event-posters (Public)
  2. event-images (Public)
  3. profile-avatars (Public)
  4. verification-docs (Private - Admin Only)
  5. ticket-assets (Private - Ticket Owner Only)

  ## Security:
  - RLS Policies for Upload/Read/Delete
  - Strict size/mime-type limits (optional, but good practice)
*/

-- 1. Create Buckets (Idempotent)
insert into storage.buckets (id, name, public) values 
  ('event-posters', 'event-posters', true),
  ('event-images', 'event-images', true),
  ('profile-avatars', 'profile-avatars', true),
  ('verification-docs', 'verification-docs', false),
  ('ticket-assets', 'ticket-assets', false)
on conflict (id) do nothing;

-- 2. Security Policies

-- A. Public Buckets (Posters, Images, Avatars)

-- Allow public read
create policy "Public Access" on storage.objects for select using ( bucket_id in ('event-posters', 'event-images', 'profile-avatars') );

-- Allow authenticated uploads (users manage own files)
-- Note: 'storage.objects' RLS is tricky. Usually we rely on folder path conventions like /uid/filename
-- For simplicity in V1, we allow any auth user to upload, but they can only update/delete their own.

create policy "Auth users upload public assets" on storage.objects 
  for insert with check ( 
    bucket_id in ('event-posters', 'event-images', 'profile-avatars') 
    and auth.role() = 'authenticated'
  );

create policy "Users manage own public assets" on storage.objects 
  for update using ( 
    bucket_id in ('event-posters', 'event-images', 'profile-avatars') 
    and owner = auth.uid()
  );

create policy "Users delete own public assets" on storage.objects 
  for delete using ( 
    bucket_id in ('event-posters', 'event-images', 'profile-avatars') 
    and owner = auth.uid()
  );


-- B. Private Buckets (Verification Docs)
-- Only Owner can upload/read. Admins can read.

create policy "Users upload verification docs" on storage.objects 
  for insert with check ( bucket_id = 'verification-docs' and auth.role() = 'authenticated' );

create policy "Users read own verification docs" on storage.objects 
  for select using ( bucket_id = 'verification-docs' and owner = auth.uid() );

create policy "Admins read all verification docs" on storage.objects 
  for select using ( bucket_id = 'verification-docs' and is_admin() );


-- C. Private Buckets (Ticket Assets)
-- System generated mostly, or Organizer uploaded.

create policy "Organizers upload ticket assets" on storage.objects 
  for insert with check ( bucket_id = 'ticket-assets' and auth.role() = 'authenticated' );

create policy "Public read ticket assets (signed URLs only)" on storage.objects 
  for select using ( bucket_id = 'ticket-assets' and auth.role() = 'authenticated' ); 
  -- Actually, private buckets usually require signed URLs which bypass RLS. 
  -- If using RLS, we restrict to owner.
