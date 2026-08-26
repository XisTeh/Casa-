begin;

alter table public.profiles rename column name to display_name;
alter table public.profiles rename column avatar_url to avatar_path;

create type public.house_member_status as enum ('active', 'inactive');

alter table public.house_members
  add column id uuid not null default gen_random_uuid(),
  add column status public.house_member_status not null default 'active';

alter table public.house_members add constraint house_members_id_key unique (id);
create index house_members_house_status_idx on public.house_members (house_id, status);

create table public.house_invites (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint house_invites_expiration_after_creation check (expires_at > created_at),
  constraint house_invites_usage_consistent check (
    (used_at is null and used_by is null) or (used_at is not null and used_by is not null)
  )
);

create index house_invites_house_id_idx on public.house_invites (house_id);
create index house_invites_active_idx on public.house_invites (expires_at) where used_at is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_path)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Novo morador'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_path', '')
  );
  return new;
end;
$$;

create or replace function private.is_house_member(target_house_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.house_members
    where house_id = target_house_id
      and user_id = target_user_id
      and status = 'active'
  );
$$;

create or replace function private.is_house_owner(target_house_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.house_members
    where house_id = target_house_id
      and user_id = target_user_id
      and role = 'owner'
      and status = 'active'
  );
$$;

create or replace function private.shares_house_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid() or exists (
    select 1 from public.house_members mine
    join public.house_members theirs using (house_id)
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
  );
$$;

create function public.create_house(house_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_house_id uuid;
  clean_name text := trim(house_name);
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(clean_name) not between 1 and 120 then raise exception 'invalid_house_name'; end if;

  insert into public.houses (name, created_by)
  values (clean_name, auth.uid()) returning id into new_house_id;
  insert into public.house_members (house_id, user_id, role, status)
  values (new_house_id, auth.uid(), 'owner', 'active');
  return new_house_id;
end;
$$;

create function public.create_house_invite(target_house_id uuid)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  compact_token text := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  expiration timestamptz := now() + interval '7 days';
begin
  if not private.is_house_owner(target_house_id) then raise exception 'house_owner_required'; end if;

  insert into public.house_invites (house_id, token_hash, created_by, expires_at)
  values (target_house_id, extensions.digest(compact_token, 'sha256'), auth.uid(), expiration);

  return query select concat_ws(
    '-', substring(compact_token from 1 for 4), substring(compact_token from 5 for 4),
    substring(compact_token from 9 for 4), substring(compact_token from 13 for 4),
    substring(compact_token from 17 for 4), substring(compact_token from 21 for 4)
  ), expiration;
end;
$$;

create function public.accept_house_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_token text := upper(regexp_replace(trim(invite_token), '[^A-Fa-f0-9]', '', 'g'));
  selected_invite public.house_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select * into selected_invite from public.house_invites
  where token_hash = extensions.digest(normalized_token, 'sha256')
    and used_at is null and expires_at > now()
  for update;

  if not found then raise exception 'invite_invalid_or_expired'; end if;
  if private.is_house_member(selected_invite.house_id) then raise exception 'already_house_member'; end if;

  insert into public.house_members (house_id, user_id, role, status)
  values (selected_invite.house_id, auth.uid(), 'member', 'active');
  update public.house_invites set used_at = now(), used_by = auth.uid()
  where id = selected_invite.id;
  return selected_invite.house_id;
end;
$$;

create function public.update_house_member_role(target_house_id uuid, target_user_id uuid, new_role public.house_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_role public.house_role;
begin
  if not private.is_house_owner(target_house_id) then raise exception 'house_owner_required'; end if;
  perform 1 from public.houses where id = target_house_id for update;
  select role into current_role from public.house_members
  where house_id = target_house_id and user_id = target_user_id and status = 'active' for update;
  if not found then raise exception 'house_member_not_found'; end if;
  if current_role = 'owner' and new_role = 'member' and (
    select count(*) from public.house_members
    where house_id = target_house_id and role = 'owner' and status = 'active'
  ) <= 1 then raise exception 'last_house_owner'; end if;
  update public.house_members set role = new_role
  where house_id = target_house_id and user_id = target_user_id;
end;
$$;

create function public.remove_house_member(target_house_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare selected_role public.house_role;
begin
  if not private.is_house_owner(target_house_id) then raise exception 'house_owner_required'; end if;
  perform 1 from public.houses where id = target_house_id for update;
  select role into selected_role from public.house_members
  where house_id = target_house_id and user_id = target_user_id and status = 'active' for update;
  if not found then raise exception 'house_member_not_found'; end if;
  if selected_role = 'owner' and (
    select count(*) from public.house_members
    where house_id = target_house_id and role = 'owner' and status = 'active'
  ) <= 1 then raise exception 'last_house_owner'; end if;
  delete from public.house_members where house_id = target_house_id and user_id = target_user_id;
end;
$$;

drop policy if exists "profiles_select_house_peers" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "houses_select_members_or_creator" on public.houses;
drop policy if exists "houses_insert_creator" on public.houses;
drop policy if exists "houses_update_owners" on public.houses;
drop policy if exists "houses_delete_owners" on public.houses;
drop policy if exists "house_members_select_house_members" on public.house_members;
drop policy if exists "house_members_insert_owners" on public.house_members;
drop policy if exists "house_members_update_owners" on public.house_members;
drop policy if exists "house_members_delete_owner_or_self" on public.house_members;

alter table public.house_invites enable row level security;

create policy "profiles_select_self_or_house_peers" on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.shares_house_with(id)));
create policy "profiles_update_self" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "houses_select_active_members" on public.houses for select to authenticated
using ((select private.is_house_member(id)));
create policy "houses_update_owners" on public.houses for update to authenticated
using ((select private.is_house_owner(id))) with check ((select private.is_house_owner(id)));
create policy "house_members_select_house_peers" on public.house_members for select to authenticated
using ((select private.is_house_member(house_id)));
create policy "house_invites_select_owners" on public.house_invites for select to authenticated
using ((select private.is_house_owner(house_id)));

revoke all on table public.profiles, public.houses, public.house_members, public.house_invites from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;
grant select on public.houses to authenticated;
grant update (name) on public.houses to authenticated;
grant select on public.house_members to authenticated;
grant select on public.house_invites to authenticated;

revoke execute on function public.create_house(text) from public, anon;
revoke execute on function public.create_house_invite(uuid) from public, anon;
revoke execute on function public.accept_house_invite(text) from public, anon;
revoke execute on function public.update_house_member_role(uuid, uuid, public.house_role) from public, anon;
revoke execute on function public.remove_house_member(uuid, uuid) from public, anon;
grant execute on function public.create_house(text) to authenticated;
grant execute on function public.create_house_invite(uuid) to authenticated;
grant execute on function public.accept_house_invite(text) to authenticated;
grant execute on function public.update_house_member_role(uuid, uuid, public.house_role) to authenticated;
grant execute on function public.remove_house_member(uuid, uuid) to authenticated;

commit;
