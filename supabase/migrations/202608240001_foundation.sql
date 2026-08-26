begin;

create extension if not exists pgcrypto;

create type public.house_role as enum ('owner', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.house_members (
  house_id uuid not null references public.houses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.house_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (house_id, user_id)
);

create index house_members_user_id_idx on public.house_members (user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger houses_set_updated_at
before update on public.houses
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), 'Novo morador'),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.is_house_member(target_house_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.house_members
    where house_id = target_house_id and user_id = target_user_id
  );
$$;

create function private.is_house_owner(target_house_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.houses
    where id = target_house_id and created_by = target_user_id
  ) or exists (
    select 1 from public.house_members
    where house_id = target_house_id and user_id = target_user_id and role = 'owner'
  );
$$;

create function private.shares_house_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid() or exists (
    select 1
    from public.house_members mine
    join public.house_members theirs using (house_id)
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;

revoke all on function private.is_house_member(uuid, uuid) from public;
revoke all on function private.is_house_owner(uuid, uuid) from public;
revoke all on function private.shares_house_with(uuid) from public;
grant execute on function private.is_house_member(uuid, uuid) to authenticated;
grant execute on function private.is_house_owner(uuid, uuid) to authenticated;
grant execute on function private.shares_house_with(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.house_members enable row level security;

create policy "profiles_select_house_peers"
on public.profiles for select
to authenticated
using (private.shares_house_with(id));

create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "houses_select_members_or_creator"
on public.houses for select
to authenticated
using (created_by = auth.uid() or private.is_house_member(id));

create policy "houses_insert_creator"
on public.houses for insert
to authenticated
with check (created_by = auth.uid());

create policy "houses_update_owners"
on public.houses for update
to authenticated
using (private.is_house_owner(id))
with check (private.is_house_owner(id));

create policy "houses_delete_owners"
on public.houses for delete
to authenticated
using (private.is_house_owner(id));

create policy "house_members_select_house_members"
on public.house_members for select
to authenticated
using (private.is_house_member(house_id) or private.is_house_owner(house_id));

create policy "house_members_insert_owners"
on public.house_members for insert
to authenticated
with check (private.is_house_owner(house_id));

create policy "house_members_update_owners"
on public.house_members for update
to authenticated
using (private.is_house_owner(house_id))
with check (private.is_house_owner(house_id));

create policy "house_members_delete_owner_or_self"
on public.house_members for delete
to authenticated
using (
  private.is_house_owner(house_id)
  or (user_id = auth.uid() and role = 'member')
);

grant select on public.profiles to authenticated;
grant insert (id, name, avatar_url) on public.profiles to authenticated;
grant update (name, avatar_url) on public.profiles to authenticated;

grant select, delete on public.houses to authenticated;
grant insert (name, created_by) on public.houses to authenticated;
grant update (name) on public.houses to authenticated;

grant select, delete on public.house_members to authenticated;
grant insert (house_id, user_id, role) on public.house_members to authenticated;
grant update (role) on public.house_members to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['houses', 'house_members']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

commit;
