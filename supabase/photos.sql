-- Run this after setup.sql. This adds a PRIVATE photo bucket, not public access.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driveos-vehicle-photos', 'driveos-vehicle-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists driveos_photos_read on storage.objects;
drop policy if exists driveos_photos_insert on storage.objects;
drop policy if exists driveos_photos_delete on storage.objects;

create policy driveos_photos_read on storage.objects for select to authenticated
using (bucket_id = 'driveos-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy driveos_photos_insert on storage.objects for insert to authenticated
with check (bucket_id = 'driveos-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy driveos_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'driveos-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
