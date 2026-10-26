-- Close anonymous writes. Demo auth users are untouched.
-- Customer bookings stay allowed for the signed-in user.
-- Walk-ins stay allowed for shop staff.
-- Public reads of shops, photos, and live offers stay open.

create or replace function public.can_write_shop_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((storage.foldername(object_name))[1], '') = 'pitstop-store'
      then public.is_platform_admin()
    when coalesce((storage.foldername(object_name))[1], '') = 'shops'
      then public.can_manage_shop(coalesce((storage.foldername(object_name))[2], ''))
    else public.can_manage_shop(coalesce((storage.foldername(object_name))[1], ''))
  end;
$$;

revoke all on function public.can_write_shop_object(text) from public;
grant execute on function public.can_write_shop_object(text) to authenticated;

drop policy if exists "Anyone can create bookings" on public.bookings;
create policy "Customers and shop staff can create bookings"
  on public.bookings
  for insert
  with check (
    public.can_manage_shop(shop_id)
    or (
      auth.uid() is not null
      and customer_id = auth.uid()
      and status = 'pending'::public.booking_status
      and booking_type::text = 'app'
    )
  );

drop policy if exists "Anyone can create parts orders" on public.parts_orders;
create policy "Customers create own parts orders"
  on public.parts_orders
  for insert
  with check (auth.uid() is not null and customer_id = auth.uid());

drop policy if exists "Anyone can create parts order items" on public.parts_order_items;
create policy "Customers create own parts order items"
  on public.parts_order_items
  for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.parts_orders o
      where o.id = parts_order_items.order_id
        and o.customer_id = auth.uid()
    )
  );

drop policy if exists "Anyone can manage shop push tokens" on public.shop_push_tokens;
drop policy if exists "Anyone can read shop push tokens" on public.shop_push_tokens;

create policy "Shop staff manage push tokens"
  on public.shop_push_tokens
  for all
  using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

create policy "Recent customers read push tokens to notify the shop"
  on public.shop_push_tokens
  for select
  using (
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.bookings b
        where b.shop_id = shop_push_tokens.shop_id
          and b.customer_id = auth.uid()
          and b.created_at > now() - interval '20 minutes'
      )
      or exists (
        select 1
        from public.store_orders o
        where o.shop_id = shop_push_tokens.shop_id
          and o.user_id = auth.uid()
          and o.created_at > now() - interval '20 minutes'
      )
      or exists (
        select 1
        from public.shop_reviews r
        where r.shop_id = shop_push_tokens.shop_id
          and r.customer_id = auth.uid()
          and r.created_at > now() - interval '20 minutes'
      )
    )
  );

drop policy if exists "Anyone can insert community reports" on public.community_reports;
create policy "Signed-in users insert own community reports"
  on public.community_reports
  for insert
  with check (auth.uid() is not null and reporter_id = auth.uid()::text);

drop policy if exists "Users can report posts" on public.posts;
drop policy if exists "Users can report comments" on public.comments;

drop policy if exists "Allow All for shop-assets" on storage.objects;
drop policy if exists "Authenticated Update Shop Assets" on storage.objects;
drop policy if exists "Authenticated Upload Shop Assets" on storage.objects;
drop policy if exists "Allow Uploads to Product Images" on storage.objects;
drop policy if exists "Allow Updates to Product Images" on storage.objects;
drop policy if exists "Allow Deletes to Product Images" on storage.objects;

create policy "Shop managers upload shop assets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'shop-assets' and public.can_write_shop_object(name));

create policy "Shop managers update shop assets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'shop-assets' and public.can_write_shop_object(name))
  with check (bucket_id = 'shop-assets' and public.can_write_shop_object(name));

create policy "Shop managers delete shop assets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'shop-assets' and public.can_write_shop_object(name));

create policy "Shop managers upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.can_write_shop_object(name));

create policy "Shop managers update product images"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images' and public.can_write_shop_object(name))
  with check (bucket_id = 'product-images' and public.can_write_shop_object(name));

create policy "Shop managers delete product images"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and public.can_write_shop_object(name));
