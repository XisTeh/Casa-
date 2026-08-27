begin;

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/jpeg']
where id = 'profile-avatars';

drop policy if exists "profile_avatars_insert_self" on storage.objects;
drop policy if exists "profile_avatars_update_self" on storage.objects;

create policy "profile_avatars_insert_self"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('webp', 'jpg', 'jpeg')
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
  and lower(storage.extension(name)) in ('webp', 'jpg', 'jpeg')
);

commit;
