-- Public product media bucket. Product records only store the resulting public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public product images are readable" on storage.objects;
create policy "Public product images are readable"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "Store owners upload product images" on storage.objects;
create policy "Store owners upload product images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'shops'
  and (storage.foldername(name))[3] = 'products'
  and exists (
    select 1
    from public.shops s
    where s.id = (storage.foldername(name))[2]
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Store owners update product images" on storage.objects;
create policy "Store owners update product images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.shops s
    where s.id = (storage.foldername(name))[2]
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'shops'
  and (storage.foldername(name))[3] = 'products'
);

drop policy if exists "Store owners delete product images" on storage.objects;
create policy "Store owners delete product images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.shops s
    where s.id = (storage.foldername(name))[2]
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
