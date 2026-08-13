-- Store Owner Dashboard Enhancements
-- Adds shop_id, sale_price, delivery addresses, and owner access

-- 1. Add shop_id to products (each shop owns their products)
alter table public.products add column if not exists shop_id uuid references public.shops(id) on delete cascade;
create index if not exists products_shop_id_idx on public.products (shop_id);

-- 2. Add sale_price for product-level discounts
alter table public.products add column if not exists sale_price numeric(12, 2) check (sale_price is null or (sale_price >= 0 and sale_price <= price));

-- 3. Add delivery address fields to store_orders
alter table public.store_orders add column if not exists customer_name text;
alter table public.store_orders add column if not exists customer_phone text;
alter table public.store_orders add column if not exists delivery_address text;
alter table public.store_orders add column if not exists delivery_notes text;
alter table public.store_orders add column if not exists shop_id uuid references public.shops(id) on delete set null;

create index if not exists store_orders_shop_id_idx on public.store_orders (shop_id, created_at desc);

-- 4. Function: Check if user owns a store shop
create or replace function public.is_store_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shops s
    where s.owner_email = (select email from auth.users where id = auth.uid())
      and s.type in ('parts', 'accessories')
      and s.is_active = true
  );
$$;

-- 5. Function: Get shop_id for current store owner
create or replace function public.get_store_owner_shop_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.shops s
  where s.owner_email = (select email from auth.users where id = auth.uid())
    and s.type in ('parts', 'accessories')
    and s.is_active = true
  limit 1;
$$;

-- 6. Update products RLS: Store owners can manage their own products
drop policy if exists "products_owner_select" on public.products;
create policy "products_owner_select" on public.products
  for select using (
    is_active = true 
    or public.is_platform_admin() 
    or shop_id = public.get_store_owner_shop_id()
  );

drop policy if exists "products_owner_insert" on public.products;
create policy "products_owner_insert" on public.products
  for insert with check (
    public.is_platform_admin() 
    or (public.is_store_owner() and shop_id = public.get_store_owner_shop_id())
  );

drop policy if exists "products_owner_update" on public.products;
create policy "products_owner_update" on public.products
  for update using (
    public.is_platform_admin() 
    or shop_id = public.get_store_owner_shop_id()
  );

drop policy if exists "products_owner_delete" on public.products;
create policy "products_owner_delete" on public.products
  for delete using (
    public.is_platform_admin() 
    or shop_id = public.get_store_owner_shop_id()
  );

-- 7. Store orders RLS: Shop owners can view/manage their shop orders
drop policy if exists "store_orders_owner_select" on public.store_orders;
create policy "store_orders_owner_select" on public.store_orders
  for select using (
    auth.uid() = user_id 
    or public.is_platform_admin() 
    or shop_id = public.get_store_owner_shop_id()
  );

drop policy if exists "store_orders_owner_update" on public.store_orders;
create policy "store_orders_owner_update" on public.store_orders
  for update using (
    public.is_platform_admin() 
    or shop_id = public.get_store_owner_shop_id()
  );

-- 8. Enhanced place_store_order function with delivery details + shop_id
create or replace function public.place_store_order(
  p_fulfillment_method public.store_fulfillment_method,
  p_delivery_fee numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_delivery_notes text default null,
  p_shop_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_subtotal numeric(12, 2) := 0;
  v_row record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.cart_items c where c.user_id = v_user_id) then
    raise exception 'Cart is empty';
  end if;

  -- Calculate subtotal and validate stock
  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      coalesce(p.sale_price, p.price) as effective_price,
      p.stock_quantity,
      p.shop_id
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
      and p.is_active = true
  loop
    if v_row.stock_quantity < v_row.quantity then
      raise exception 'Insufficient stock for product: %', v_row.name;
    end if;
    v_subtotal := v_subtotal + (v_row.effective_price * v_row.quantity);
  end loop;

  -- Create order
  insert into public.store_orders (
    user_id,
    shop_id,
    subtotal,
    delivery_fee,
    total_price,
    fulfillment_method,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_notes,
    status
  )
  values (
    v_user_id,
    p_shop_id,
    v_subtotal,
    coalesce(p_delivery_fee, 0),
    v_subtotal + coalesce(p_delivery_fee, 0),
    p_fulfillment_method,
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_delivery_notes,
    'pending'
  )
  returning id into v_order_id;

  -- Create order items and decrement stock
  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      coalesce(p.sale_price, p.price) as effective_price
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
      and p.is_active = true
  loop
    insert into public.store_order_items (
      order_id,
      product_id,
      product_name,
      unit_price,
      quantity,
      line_total
    )
    values (
      v_order_id,
      v_row.product_id,
      v_row.name,
      v_row.effective_price,
      v_row.quantity,
      v_row.effective_price * v_row.quantity
    );

    -- Atomic stock decrement
    update public.products
    set stock_quantity = stock_quantity - v_row.quantity,
        updated_at = now()
    where id = v_row.product_id;
  end loop;

  -- Clear cart
  delete from public.cart_items where user_id = v_user_id;

  return v_order_id;
end;
$$;

grant execute on function public.place_store_order(
  public.store_fulfillment_method, 
  numeric, 
  text, 
  text, 
  text, 
  text, 
  uuid
) to authenticated;

-- 9. Function: Update order status (store owner only)
create or replace function public.update_store_order_status(
  p_order_id uuid,
  p_new_status public.store_order_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  -- Get order's shop_id
  select shop_id into v_shop_id
  from public.store_orders
  where id = p_order_id;

  -- Verify owner or admin
  if not (
    public.is_platform_admin() 
    or v_shop_id = public.get_store_owner_shop_id()
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.store_orders
  set status = p_new_status,
      updated_at = now()
  where id = p_order_id;
end;
$$;

grant execute on function public.update_store_order_status(uuid, public.store_order_status) to authenticated;

-- 10. Function: Get store owner dashboard stats
create or replace function public.get_store_owner_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_result json;
begin
  v_shop_id := public.get_store_owner_shop_id();
  
  if v_shop_id is null then
    return json_build_object(
      'totalRevenue', 0,
      'pendingOrders', 0,
      'lowStockCount', 0,
      'totalProducts', 0
    );
  end if;

  select json_build_object(
    'totalRevenue', coalesce(sum(case when o.status = 'completed' then o.total_price else 0 end), 0),
    'pendingOrders', coalesce(sum(case when o.status = 'pending' then 1 else 0 end), 0),
    'lowStockCount', (
      select count(*) 
      from public.products p 
      where p.shop_id = v_shop_id 
        and p.stock_quantity < 5 
        and p.is_active = true
    ),
    'totalProducts', (
      select count(*) 
      from public.products p 
      where p.shop_id = v_shop_id 
        and p.is_active = true
    )
  ) into v_result
  from public.store_orders o
  where o.shop_id = v_shop_id;

  return v_result;
end;
$$;

grant execute on function public.get_store_owner_stats() to authenticated;

-- Drop legacy policies
drop policy if exists "products_public_read" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;
drop policy if exists "store_orders_select_own" on public.store_orders;
drop policy if exists "store_orders_admin_update" on public.store_orders;
