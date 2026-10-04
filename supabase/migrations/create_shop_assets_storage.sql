-- Public shop media bucket for profile photos, cover banners, and gallery images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-assets',
  'shop-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public Read Shop Assets" on storage.objects;
create policy "Public Read Shop Assets"
on storage.objects for select
using (bucket_id = 'shop-assets');

drop policy if exists "Authenticated Upload Shop Assets" on storage.objects;
create policy "Authenticated Upload Shop Assets"
on storage.objects for insert
to authenticated
with check (bucket_id = 'shop-assets');

drop policy if exists "Authenticated Update Shop Assets" on storage.objects;
create policy "Authenticated Update Shop Assets"
on storage.objects for update
to authenticated
using (bucket_id = 'shop-assets')
with check (bucket_id = 'shop-assets');
