-- Car wash shops sell products for in-shop pickup only, and branch managers handle
-- those orders alongside the owner.

create or replace function public.store_orders_enforce_wash_pickup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.shops s where s.id = new.shop_id and s.type = 'wash') then
    new.fulfillment_method := 'pickup';
    new.payment_method := 'pickup';
    new.delivery_fee := 0;
    new.total_price := coalesce(new.subtotal, 0);
    new.delivery_address := null;
  end if;
  return new;
end;
$$;

drop trigger if exists store_orders_enforce_wash_pickup on public.store_orders;
create trigger store_orders_enforce_wash_pickup
  before insert on public.store_orders
  for each row execute function public.store_orders_enforce_wash_pickup();

drop policy if exists store_orders_customer_or_owner_read on public.store_orders;
create policy store_orders_customer_or_owner_read on public.store_orders
  for select using (
    auth.uid() = user_id or public.is_platform_admin() or public.can_manage_shop(shop_id)
  );

drop policy if exists store_orders_owner_update on public.store_orders;
create policy store_orders_owner_update on public.store_orders
  for update
  using (public.is_platform_admin() or public.can_manage_shop(shop_id))
  with check (public.is_platform_admin() or public.can_manage_shop(shop_id));

drop policy if exists store_order_items_customer_or_owner_read on public.store_order_items;
create policy store_order_items_customer_or_owner_read on public.store_order_items
  for select using (
    exists (
      select 1 from public.store_orders o
      where o.id = store_order_items.order_id
        and (o.user_id = auth.uid() or public.is_platform_admin() or public.can_manage_shop(o.shop_id))
    )
  );
