-- PitStop 2.0 — in-house PitStop Store (spare parts & accessories)
-- Platform-owned catalog, persisted cart, COD / pickup orders.

do $$ begin
  create type public.store_product_category as enum ('spare_parts', 'accessories');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_compatibility_type as enum ('universal', 'brand_specific', 'model_specific');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_fulfillment_method as enum ('cod', 'pickup');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category public.store_product_category not null,
  sub_category text not null,
  price numeric(12, 2) not null check (price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  compatibility_type public.store_compatibility_type not null default 'universal',
  rating numeric(2, 1) not null default 4.5 check (rating >= 0 and rating <= 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_compatibility (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  brand text,
  model text,
  year_start integer,
  year_end integer,
  created_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  fulfillment_method public.store_fulfillment_method not null,
  status public.store_order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category, sub_category);
create index if not exists products_active_idx on public.products (is_active);
create index if not exists product_compatibility_product_id_idx on public.product_compatibility (product_id);
create index if not exists cart_items_user_id_idx on public.cart_items (user_id);
create index if not exists store_orders_user_id_idx on public.store_orders (user_id, created_at desc);
create index if not exists store_order_items_order_id_idx on public.store_order_items (order_id);

-- Admin helper
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.is_active = true
  );
$$;

-- Atomic checkout: create order, line items, decrement stock, clear cart lines used.
create or replace function public.place_store_order(
  p_fulfillment_method public.store_fulfillment_method,
  p_delivery_fee numeric default 0
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

  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      p.price,
      p.stock_quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
      and p.is_active = true
  loop
    if v_row.stock_quantity < v_row.quantity then
      raise exception 'Insufficient stock for product %', v_row.product_id;
    end if;
    v_subtotal := v_subtotal + (v_row.price * v_row.quantity);
  end loop;

  insert into public.store_orders (
    user_id,
    subtotal,
    delivery_fee,
    total_price,
    fulfillment_method,
    status
  )
  values (
    v_user_id,
    v_subtotal,
    coalesce(p_delivery_fee, 0),
    v_subtotal + coalesce(p_delivery_fee, 0),
    p_fulfillment_method,
    'pending'
  )
  returning id into v_order_id;

  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      p.price,
      p.stock_quantity
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
      v_row.price,
      v_row.quantity,
      v_row.price * v_row.quantity
    );

    update public.products
    set stock_quantity = stock_quantity - v_row.quantity,
        updated_at = now()
    where id = v_row.product_id;
  end loop;

  delete from public.cart_items where user_id = v_user_id;

  return v_order_id;
end;
$$;

grant execute on function public.place_store_order(public.store_fulfillment_method, numeric) to authenticated;

alter table public.products enable row level security;
alter table public.product_compatibility enable row level security;
alter table public.cart_items enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using (is_active = true or public.is_platform_admin());

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert" on public.products
  for insert with check (public.is_platform_admin());

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update" on public.products
  for update using (public.is_platform_admin());

drop policy if exists "products_admin_delete" on public.products;
create policy "products_admin_delete" on public.products
  for delete using (public.is_platform_admin());

drop policy if exists "product_compatibility_public_read" on public.product_compatibility;
create policy "product_compatibility_public_read" on public.product_compatibility
  for select using (true);

drop policy if exists "product_compatibility_admin_write" on public.product_compatibility;
create policy "product_compatibility_admin_write" on public.product_compatibility
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists "cart_items_select_own" on public.cart_items;
create policy "cart_items_select_own" on public.cart_items
  for select using (auth.uid() = user_id);

drop policy if exists "cart_items_insert_own" on public.cart_items;
create policy "cart_items_insert_own" on public.cart_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "cart_items_update_own" on public.cart_items;
create policy "cart_items_update_own" on public.cart_items
  for update using (auth.uid() = user_id);

drop policy if exists "cart_items_delete_own" on public.cart_items;
create policy "cart_items_delete_own" on public.cart_items
  for delete using (auth.uid() = user_id);

drop policy if exists "store_orders_select_own" on public.store_orders;
create policy "store_orders_select_own" on public.store_orders
  for select using (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists "store_orders_admin_update" on public.store_orders;
create policy "store_orders_admin_update" on public.store_orders
  for update using (public.is_platform_admin());

drop policy if exists "store_order_items_select_own" on public.store_order_items;
create policy "store_order_items_select_own" on public.store_order_items
  for select using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and (o.user_id = auth.uid() or public.is_platform_admin())
    )
  );
