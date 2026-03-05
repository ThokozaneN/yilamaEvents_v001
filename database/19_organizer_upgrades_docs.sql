/*
  # Yilama Events: Organizer Documents & Tier Upgrades
  
  1. Creates the `organizer-documents` storage bucket for KYC/Verification uploads.
  2. Creates an RPC function `upgrade_organizer_tier` to allow users to upgrade 
     their subscription tier directly from the app (simulating a successful payment).
*/

-- 1. Organizer Documents Storage Bucket
insert into storage.buckets (id, name, public) 
values ('organizer-documents', 'organizer-documents', false)
on conflict (id) do nothing;

-- Policies for Documents (Private)
create policy "Users can upload their own documents"
on storage.objects for insert
with check (
    bucket_id = 'organizer-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Users can update their own documents"
on storage.objects for update
using (
    bucket_id = 'organizer-documents'
    and auth.uid()::text = owner::text
)
with check (
    bucket_id = 'organizer-documents'
    and auth.uid()::text = owner::text
);

create policy "Users can read their own documents"
on storage.objects for select
using ( auth.uid() = owner );

create policy "Admins can read all documents"
on storage.objects for select
using ( is_admin() );


-- 2. Upgrade Tier RPC (Bypasses the profile trigger via definer)
create or replace function upgrade_organizer_tier(p_new_tier text)
returns jsonb as $$
declare
    v_user_id uuid;
begin
    v_user_id := auth.uid();
    
    if v_user_id is null then
        return jsonb_build_object('success', false, 'message', 'Unauthorized');
    end if;

    -- Basic validation
    if p_new_tier not in ('free', 'pro', 'premium') then
        return jsonb_build_object('success', false, 'message', 'Invalid tier specified');
    end if;

    -- Because this runs as SECURITY DEFINER (typically the postgres user), 
    -- it is allowed to update the organizer_tier without triggering the 'prevent self-update' error.
    update profiles 
    set organizer_tier = p_new_tier,
        updated_at = now()
    where id = v_user_id;

    return jsonb_build_object('success', true, 'message', 'Tier upgraded successfully to ' || p_new_tier);
end;
$$ language plpgsql security definer set search_path = public;
