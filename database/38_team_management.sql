/*
  # Yilama Events: Team Management v1.0
  
  Dependencies: 04_events_and_permissions.sql

  ## Architecture:
  - Formalizes `event_team_members` role enum.
  - Adds safe RPC for inviting existing users by email.
*/

-- 1. Ensure Role structure
do $$ begin
    alter table event_team_members drop constraint if exists event_team_members_role_check;
    alter table event_team_members add constraint event_team_members_role_check check (role in ('admin', 'finance', 'scanner', 'viewer', 'staff'));
exception
    when others then null;
end $$;


-- 2. Invite Team Member RPC
-- Looks up by email to avoid needing to know the user's UUID.
create or replace function invite_team_member(
    p_event_id uuid,
    p_email text,
    p_role text
) returns jsonb as $$
declare
    v_user_id uuid;
    v_is_owner boolean;
    v_existing_role text;
begin
    -- 1. Ensure caller owns the event (or is an admin)
    select owns_event(p_event_id) into v_is_owner;
    if not v_is_owner then
        return jsonb_build_object('success', false, 'message', 'Permission denied.');
    end if;

    -- 2. Validate Role
    if p_role not in ('admin', 'finance', 'scanner', 'viewer', 'staff') then
        return jsonb_build_object('success', false, 'message', 'Invalid role specified.');
    end if;

    -- 3. Lookup User
    select id into v_user_id from profiles where email = p_email;
    if v_user_id is null then
        return jsonb_build_object('success', false, 'message', 'User not found. They must create an account first.');
    end if;

    -- 4. Prevent inviting oneself
    if v_user_id = auth.uid() then
        return jsonb_build_object('success', false, 'message', 'You cannot invite yourself to your own event.');
    end if;

    -- 5. Check existing membership
    select role into v_existing_role from event_team_members where event_id = p_event_id and user_id = v_user_id;

    if v_existing_role is not null then
        -- Update existing role
        update event_team_members 
        set role = p_role, updated_at = now() 
        where event_id = p_event_id and user_id = v_user_id;
        
        -- Also update scanners table if applicable
        if p_role = 'scanner' then
             insert into event_scanners (event_id, user_id, is_active) values (p_event_id, v_user_id, true)
             on conflict(event_id, user_id) do update set is_active = true;
        else
             update event_scanners set is_active = false where event_id = p_event_id and user_id = v_user_id;
        end if;

        return jsonb_build_object('success', true, 'message', 'User role updated.');
    end if;

    -- 6. Insert new member
    insert into event_team_members (event_id, user_id, role, accepted_at) 
    values (p_event_id, v_user_id, p_role, now()); -- Auto-accept for now for smoother UX

    -- If scanner, also add to event_scanners
    if p_role = 'scanner' then
        insert into event_scanners (event_id, user_id, is_active) values (p_event_id, v_user_id, true)
        on conflict(event_id, user_id) do update set is_active = true;
    end if;

    return jsonb_build_object('success', true, 'message', 'Member added successfully.');
end;
$$ language plpgsql security definer;


-- 3. View Team Members RPC
create or replace function get_event_team(p_event_id uuid)
returns table (
    membership_id uuid,
    user_id uuid,
    email text,
    name text,
    role text,
    joined_at timestamptz
) as $$
begin
    -- Ensure caller has rights to view
    if not owns_event(p_event_id) and not is_event_team_member(p_event_id) then
        return; -- Empty return
    end if;

    return query
    select 
        etm.id,
        p.id,
        p.email,
        p.name,
        etm.role,
        etm.accepted_at
    from event_team_members etm
    join profiles p on etm.user_id = p.id
    where etm.event_id = p_event_id;
end;
$$ language plpgsql security definer;
