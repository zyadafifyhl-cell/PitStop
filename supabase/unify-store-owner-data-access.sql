-- Scope store inventory and orders to the owning merchant.

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  using (
    is_active = true
    or public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "products_admin_insert" on public.products;
create policy "products_owner_insert"
  on public.products for insert
  with check (
    public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "products_admin_update" on public.products;
create policy "products_owner_update"
  on public.products for update
  using (
    public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  )
  with check (
    public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "products_admin_delete" on public.products;
create policy "products_owner_delete"
  on public.products for delete
  using (
    public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "store_orders_select_own" on public.store_orders;
create policy "store_orders_customer_or_owner_read"
  on public.store_orders for select
  using (
    auth.uid() = user_id
    or public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "store_orders_admin_update" on public.store_orders;
create policy "store_orders_owner_update"
  on public.store_orders for update
  using (
    public.is_platform_admin()
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

drop policy if exists "store_order_items_select_own" on public.store_order_items;
create policy "store_order_items_customer_or_owner_read"
  on public.store_order_items for select
  using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and (
          o.user_id = auth.uid()
          or public.is_platform_admin()
          or (o.shop_id is not null and public.is_shop_owner(o.shop_id))
        )
    )
  );
