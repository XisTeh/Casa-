begin;

alter table public.profiles
  add column avatar_source_path text,
  add column avatar_crop jsonb,
  add column avatar_revision bigint not null default 0,
  add column avatar_updated_at timestamptz;

alter table public.profiles
  add constraint profiles_avatar_metadata_consistent check (
    (
      avatar_revision = 0
      and avatar_source_path is null
      and avatar_crop is null
    ) or (
      avatar_revision > 0
      and (
        (avatar_path is null and avatar_source_path is null and avatar_crop is null)
        or (
          avatar_path is not null
          and avatar_source_path is not null
          and avatar_crop is not null
          and jsonb_typeof(avatar_crop) = 'object'
          and jsonb_typeof(avatar_crop -> 'zoom') = 'number'
          and jsonb_typeof(avatar_crop -> 'centerX') = 'number'
          and jsonb_typeof(avatar_crop -> 'centerY') = 'number'
          and (avatar_crop ->> 'zoom')::numeric between 1 and 4
          and (avatar_crop ->> 'centerX')::numeric between 0 and 1
          and (avatar_crop ->> 'centerY')::numeric between 0 and 1
        )
      )
    )
  ),
  add constraint profiles_avatar_revision_nonnegative check (avatar_revision >= 0),
  add constraint profiles_avatar_timestamp_consistent check (
    (avatar_revision = 0 and avatar_updated_at is null)
    or (avatar_revision > 0 and avatar_updated_at is not null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_avatars_select_authorized" on storage.objects;
drop policy if exists "profile_avatars_insert_self" on storage.objects;
drop policy if exists "profile_avatars_update_self" on storage.objects;
drop policy if exists "profile_avatars_delete_self" on storage.objects;

create policy "profile_avatars_select_authorized"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.shares_house_with(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy "profile_avatars_insert_self"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'webp'
);

create policy "profile_avatars_update_self"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = 'webp'
);

create policy "profile_avatars_delete_self"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create function public.apply_profile_avatar(
  target_profile_id uuid,
  item_avatar_path text,
  item_avatar_source_path text,
  item_avatar_crop jsonb,
  item_avatar_revision bigint,
  item_avatar_updated_at timestamptz
)
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_removal boolean := item_avatar_path is null;
  expected_prefix text := target_profile_id::text || '/';
begin
  if auth.uid() is null or target_profile_id <> auth.uid() then
    raise exception 'profile_avatar_owner_required';
  end if;
  if item_avatar_revision <= 0 or item_avatar_updated_at is null then
    raise exception 'invalid_profile_avatar_revision';
  end if;
  if (
    is_removal and (item_avatar_source_path is not null or item_avatar_crop is not null)
  ) or (
    not is_removal and (item_avatar_source_path is null or item_avatar_crop is null)
  ) then
    raise exception 'incomplete_profile_avatar_metadata';
  end if;
  if not is_removal and (
    not (item_avatar_path like expected_prefix || '%')
    or not (item_avatar_source_path like expected_prefix || '%')
  ) then
    raise exception 'invalid_profile_avatar_path';
  end if;

  update public.profiles
  set avatar_path = item_avatar_path,
      avatar_source_path = item_avatar_source_path,
      avatar_crop = item_avatar_crop,
      avatar_revision = item_avatar_revision,
      avatar_updated_at = item_avatar_updated_at
  where id = target_profile_id
    and (avatar_updated_at is null or item_avatar_updated_at >= avatar_updated_at);

  return query select * from public.profiles where id = target_profile_id;
end;
$$;

revoke execute on function public.apply_profile_avatar(uuid, text, text, jsonb, bigint, timestamptz)
from public, anon;
grant execute on function public.apply_profile_avatar(uuid, text, text, jsonb, bigint, timestamptz)
to authenticated;

revoke update (avatar_path) on public.profiles from authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

commit;
