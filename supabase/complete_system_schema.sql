-- PitStop complete persistence schema.
-- Idempotent: safe to re-run against the live CareCare project.
-- Canonical app columns are kept (type, stock_quantity, total_price, line_total, scheduled_at)
-- with requested aliases (category, stock, total_amount, subtotal, booking_date, time_slot).

create extension if not exists pgcrypto;

do $$ begin
  create type public.shop_type as enum ('maintenance', 'wash', 'parts', 'winch', 'accessories');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.store_product_category as enum ('spare_parts', 'accessories');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.store_compatibility_type as enum ('universal', 'brand_specific', 'model_specific');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.store_fulfillment_method as enum ('cod', 'pickup', 'card');
exception when duplicate_object then null; end $$;
alter type public.store_fulfillment_method add value if not exists 'card';
do $$ begin
  create type public.store_order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'done', 'in_progress', 'no_show', 'suspended_by_shop');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_type as enum ('app', 'walk_in');
exception when duplicate_object then null; end $$;

create table if not exists public.shops (
  id text primary key,
  name text not null,
  name_ar text not null default '',
  type public.shop_type not null,
  owner_email text not null,
  phone text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shops add column if not exists category text;
alter table public.shops add column if not exists is_active boolean not null default true;
alter table public.shops add column if not exists is_premium boolean not null default false;
alter table public.shops add column if not exists created_at timestamptz not null default now();

create or replace function public.sync_shop_category()
returns trigger language plpgsql set search_path = public as $$
begin
  new.category := case new.type::text
    when 'wash' then 'car_wash'
    when 'parts' then 'spare_parts'
    else new.type::text
  end;
  return new;
end;
$$;
drop trigger if exists shops_sync_category on public.shops;
create trigger shops_sync_category
before insert or update of type on public.shops
for each row execute function public.sync_shop_category();

update public.shops set category = case type::text
  when 'wash' then 'car_wash'
  when 'parts' then 'spare_parts'
  else type::text
end
where category is distinct from case type::text
  when 'wash' then 'car_wash'
  when 'parts' then 'spare_parts'
  else type::text
end;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id text,
  name text not null,
  description text,
  category public.store_product_category not null,
  sub_category text not null default 'other',
  price numeric(12,2) not null default 0 check (price >= 0),
  sale_price numeric(12,2),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  compatibility_type public.store_compatibility_type not null default 'universal',
  rating numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists shop_id text;
alter table public.products add column if not exists sale_price numeric(12,2);
alter table public.products add column if not exists stock_quantity integer not null default 0;
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'stock'
  ) then
    alter table public.products add column stock integer generated always as (stock_quantity) stored;
  end if;
end $$;

do $$ begin
  alter table public.products add constraint products_shop_id_fkey
    foreign key (shop_id) references public.shops(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_sale_price_lte_price
    check (sale_price is null or (sale_price >= 0 and sale_price <= price));
exception when duplicate_object then null; end $$;

alter table public.products alter column shop_id set not null;

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
  shop_id text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total_price numeric(12,2) not null default 0 check (total_price >= 0),
  fulfillment_method public.store_fulfillment_method not null,
  status public.store_order_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_orders add column if not exists shop_id text;
alter table public.store_orders add column if not exists customer_name text;
alter table public.store_orders add column if not exists customer_phone text;
alter table public.store_orders add column if not exists delivery_address text;
alter table public.store_orders add column if not exists delivery_notes text;
alter table public.store_orders add column if not exists notes text;
alter table public.store_orders add column if not exists payment_method text;
alter table public.store_orders add column if not exists is_hidden_by_merchant boolean not null default false;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'customer_id'
  ) then
    alter table public.store_orders add column customer_id uuid generated always as (user_id) stored;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_orders' and column_name = 'total_amount'
  ) then
    alter table public.store_orders add column total_amount numeric generated always as (total_price) stored;
  end if;
end $$;

-- Unlinkable leftover rows cannot satisfy shop_id NOT NULL / FK.
delete from public.store_order_items i
using public.store_orders o
where i.order_id = o.id
  and o.shop_id is null
  and not exists (
    select 1 from public.store_order_items x
    join public.products p on p.id = x.product_id
    where x.order_id = o.id and p.shop_id is not null
  );
delete from public.store_orders o
where o.shop_id is null
  and not exists (
    select 1 from public.store_order_items x
    join public.products p on p.id = x.product_id
    where x.order_id = o.id and p.shop_id is not null
  );

update public.store_orders o
set shop_id = (
  select p.shop_id
  from public.store_order_items x
  join public.products p on p.id = x.product_id
  where x.order_id = o.id and p.shop_id is not null
  limit 1
)
where o.shop_id is null;

update public.store_orders
set payment_method = fulfillment_method::text
where payment_method is null;

alter table public.store_orders alter column shop_id set not null;
alter table public.store_orders alter column payment_method set not null;

alter table public.store_orders drop constraint if exists store_orders_shop_id_fkey;
alter table public.store_orders add constraint store_orders_shop_id_fkey
  foreign key (shop_id) references public.shops(id) on delete restrict;

do $$ begin
  alter table public.store_orders add constraint store_orders_payment_method_check
    check (payment_method in ('cod', 'card', 'pickup'));
exception when duplicate_object then null; end $$;

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_order_items' and column_name = 'subtotal'
  ) then
    alter table public.store_order_items add column subtotal numeric generated always as (line_total) stored;
  end if;
end $$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  shop_type public.shop_type not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_phone text,
  car_type text not null,
  car_color text not null default '',
  service_name text,
  service_price_egp numeric(12,2) not null default 0,
  scheduled_at timestamptz not null,
  status public.booking_status not null default 'pending',
  booking_type public.booking_type not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists booking_date date;
alter table public.bookings add column if not exists time_slot text;
alter table public.bookings add column if not exists total_price numeric(12,2);
alter table public.bookings add column if not exists vehicle_details jsonb not null default '{}'::jsonb;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();
alter table public.bookings add column if not exists is_hidden_by_merchant boolean not null default false;

create or replace function public.sync_booking_compatibility_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  new.booking_date := (new.scheduled_at at time zone 'Africa/Cairo')::date;
  new.time_slot := to_char(new.scheduled_at at time zone 'Africa/Cairo', 'HH24:MI');
  new.total_price := coalesce(new.final_amount_paid_egp, new.service_price_egp, 0);
  new.vehicle_details := jsonb_strip_nulls(
    coalesce(new.vehicle_details, '{}'::jsonb) || jsonb_build_object(
      'model', nullif(new.car_type, ''),
      'color', nullif(new.car_color, ''),
      'plate', coalesce(new.vehicle_details->>'plate', null)
    )
  );
  return new;
end;
$$;

drop trigger if exists bookings_sync_compatibility_columns on public.bookings;
create trigger bookings_sync_compatibility_columns
before insert or update of scheduled_at, service_price_egp, final_amount_paid_egp, car_type, car_color, vehicle_details
on public.bookings for each row execute function public.sync_booking_compatibility_columns();

update public.bookings
set vehicle_details = coalesce(vehicle_details, '{}'::jsonb)
where vehicle_details is null;
update public.bookings set booking_date = (scheduled_at at time zone 'Africa/Cairo')::date where booking_date is null;
update public.bookings set time_slot = to_char(scheduled_at at time zone 'Africa/Cairo', 'HH24:MI') where time_slot is null;
update public.bookings set total_price = coalesce(final_amount_paid_egp, service_price_egp, 0) where total_price is null;

create table if not exists public.shop_extras (
  shop_id text primary key references public.shops(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists shops_owner_email_idx on public.shops (lower(owner_email));
create index if not exists shops_category_active_idx on public.shops (category, is_active);
create index if not exists products_shop_active_idx on public.products (shop_id, is_active, created_at desc);
create index if not exists products_low_stock_idx on public.products (shop_id, stock_quantity) where is_active;
create index if not exists cart_items_user_id_idx on public.cart_items (user_id);
create unique index if not exists cart_items_user_product_uidx on public.cart_items (user_id, product_id);
create index if not exists store_orders_shop_created_idx on public.store_orders (shop_id, created_at desc);
create index if not exists store_orders_customer_created_idx on public.store_orders (user_id, created_at desc);
create index if not exists store_orders_shop_status_idx on public.store_orders (shop_id, status, created_at desc);
create index if not exists store_order_items_order_idx on public.store_order_items (order_id);
create index if not exists bookings_shop_scheduled_idx on public.bookings (shop_id, scheduled_at desc);
create index if not exists bookings_customer_scheduled_idx on public.bookings (customer_id, scheduled_at desc);
create index if not exists bookings_shop_status_idx on public.bookings (shop_id, status, scheduled_at);

alter table public.shops enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.bookings enable row level security;
alter table public.shop_extras enable row level security;

drop policy if exists cart_items_select_own on public.cart_items;
create policy cart_items_select_own on public.cart_items for select to authenticated
using (auth.uid() = user_id);
drop policy if exists cart_items_insert_own on public.cart_items;
create policy cart_items_insert_own on public.cart_items for insert to authenticated
with check (auth.uid() = user_id);
drop policy if exists cart_items_update_own on public.cart_items;
create policy cart_items_update_own on public.cart_items for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists cart_items_delete_own on public.cart_items;
create policy cart_items_delete_own on public.cart_items for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select
using (is_active or public.is_platform_admin() or public.can_manage_shop(shop_id));
drop policy if exists products_owner_insert on public.products;
create policy products_owner_insert on public.products for insert to authenticated
with check (public.is_platform_admin() or public.can_manage_shop(shop_id));
drop policy if exists products_owner_update on public.products;
create policy products_owner_update on public.products for update to authenticated
using (public.is_platform_admin() or public.can_manage_shop(shop_id))
with check (public.is_platform_admin() or public.can_manage_shop(shop_id));
drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products for delete to authenticated
using (public.is_platform_admin() or public.can_manage_shop(shop_id));

drop policy if exists store_orders_customer_or_owner_read on public.store_orders;
create policy store_orders_customer_or_owner_read on public.store_orders for select to authenticated
using (auth.uid() = user_id or public.is_platform_admin() or public.is_shop_owner(shop_id));
drop policy if exists store_orders_owner_update on public.store_orders;
create policy store_orders_owner_update on public.store_orders for update to authenticated
using (public.is_platform_admin() or public.is_shop_owner(shop_id))
with check (public.is_platform_admin() or public.is_shop_owner(shop_id));
drop policy if exists store_order_items_customer_or_owner_read on public.store_order_items;
create policy store_order_items_customer_or_owner_read on public.store_order_items for select to authenticated
using (exists (
  select 1 from public.store_orders o
  where o.id = order_id
    and (o.user_id = auth.uid() or public.is_platform_admin() or public.is_shop_owner(o.shop_id))
));

drop policy if exists shop_extras_public_read on public.shop_extras;
create policy shop_extras_public_read on public.shop_extras for select using (true);
drop policy if exists shop_extras_owner_insert on public.shop_extras;
create policy shop_extras_owner_insert on public.shop_extras for insert to authenticated
with check (public.is_platform_admin() or public.is_shop_owner(shop_id));
drop policy if exists shop_extras_owner_update on public.shop_extras;
create policy shop_extras_owner_update on public.shop_extras for update to authenticated
using (public.is_platform_admin() or public.is_shop_owner(shop_id))
with check (public.is_platform_admin() or public.is_shop_owner(shop_id));
drop policy if exists shop_extras_owner_delete on public.shop_extras;
create policy shop_extras_owner_delete on public.shop_extras for delete to authenticated
using (public.is_platform_admin() or public.is_shop_owner(shop_id));

drop function if exists public.place_store_order(public.store_fulfillment_method, numeric);
drop function if exists public.place_store_order(public.store_fulfillment_method, numeric, text, text, text, text);

create or replace function public.place_store_order(
  p_fulfillment_method public.store_fulfillment_method,
  p_delivery_fee numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_shop_id text;
  v_cart_count integer;
  v_shop_count integer;
  v_invalid_count integer;
  v_subtotal numeric(12,2) := 0;
  v_customer_name text;
  v_customer_phone text;
  v_row record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_delivery_fee, 0) < 0 then raise exception 'Delivery fee cannot be negative'; end if;

  select count(*), count(distinct p.shop_id), min(p.shop_id),
         count(*) filter (where p.id is null or p.shop_id is null or not p.is_active)
  into v_cart_count, v_shop_count, v_shop_id, v_invalid_count
  from public.cart_items c
  left join public.products p on p.id = c.product_id
  where c.user_id = v_user_id;

  if v_cart_count = 0 then raise exception 'Cart is empty'; end if;
  if v_invalid_count > 0 then raise exception 'Cart contains unavailable products'; end if;
  if v_shop_count <> 1 or v_shop_id is null then
    raise exception 'Checkout supports products from one merchant at a time';
  end if;
  if not exists (select 1 from public.shops where id = v_shop_id and is_active) then
    raise exception 'Store is currently unavailable';
  end if;

  perform p.id
  from public.products p
  join public.cart_items c on c.product_id = p.id
  where c.user_id = v_user_id
  order by p.id
  for update of p;

  for v_row in
    select c.product_id, c.quantity, p.name,
           coalesce(p.sale_price, p.price) as unit_price,
           p.stock_quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id and p.shop_id = v_shop_id and p.is_active
  loop
    if v_row.stock_quantity < v_row.quantity then
      raise exception 'Insufficient stock for product % (available %, requested %)',
        v_row.product_id, v_row.stock_quantity, v_row.quantity;
    end if;
    v_subtotal := v_subtotal + (v_row.unit_price * v_row.quantity);
  end loop;

  select coalesce(p_customer_name, u.full_name), coalesce(p_customer_phone, u.phone)
  into v_customer_name, v_customer_phone
  from public.users u where u.id = v_user_id;

  insert into public.store_orders (
    user_id, shop_id, customer_name, customer_phone, delivery_address,
    delivery_notes, notes, subtotal, delivery_fee, total_price,
    fulfillment_method, payment_method, status
  ) values (
    v_user_id, v_shop_id, v_customer_name, v_customer_phone, nullif(trim(p_delivery_address), ''),
    nullif(trim(p_notes), ''), nullif(trim(p_notes), ''), v_subtotal, coalesce(p_delivery_fee, 0),
    v_subtotal + coalesce(p_delivery_fee, 0), p_fulfillment_method,
    p_fulfillment_method::text, 'pending'
  ) returning id into v_order_id;

  for v_row in
    select c.product_id, c.quantity, p.name, coalesce(p.sale_price, p.price) as unit_price
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id and p.shop_id = v_shop_id and p.is_active
  loop
    insert into public.store_order_items (
      order_id, product_id, product_name, unit_price, quantity, line_total
    ) values (
      v_order_id, v_row.product_id, v_row.name, v_row.unit_price,
      v_row.quantity, v_row.unit_price * v_row.quantity
    );
    update public.products
    set stock_quantity = stock_quantity - v_row.quantity, updated_at = now()
    where id = v_row.product_id and stock_quantity >= v_row.quantity;
    if not found then
      raise exception 'Insufficient stock for product % (stock changed during checkout)', v_row.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = v_user_id;
  return v_order_id;
end;
$$;

revoke all on function public.place_store_order(
  public.store_fulfillment_method, numeric, text, text, text, text
) from public;
grant execute on function public.place_store_order(
  public.store_fulfillment_method, numeric, text, text, text, text
) to authenticated;

create or replace function public.update_store_order_status(
  p_order_id uuid,
  p_new_status public.store_order_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_shop_id text;
begin
  select shop_id into v_shop_id from public.store_orders where id = p_order_id;
  if v_shop_id is null then raise exception 'Order not found'; end if;
  if not (public.is_platform_admin() or public.is_shop_owner(v_shop_id)) then
    raise exception 'Not authorized to update this order';
  end if;
  update public.store_orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id;
end;
$$;
revoke all on function public.update_store_order_status(uuid, public.store_order_status) from public;
grant execute on function public.update_store_order_status(uuid, public.store_order_status) to authenticated;

create or replace function public.get_store_owner_stats(p_shop_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare res json;
begin
  if p_shop_id is null or btrim(p_shop_id) = '' then
    raise exception 'Shop id is required';
  end if;
  if not (public.is_platform_admin() or public.is_shop_owner(p_shop_id)) then
    raise exception 'Not authorized to read store stats';
  end if;

  select json_build_object(
    'total_revenue', coalesce((
      select sum(total_price) from public.store_orders
      where shop_id = p_shop_id and status in ('pending', 'preparing', 'ready', 'completed')
    ), 0),
    'total_orders', (
      select count(*) from public.store_orders where shop_id = p_shop_id
    ),
    'pending_orders', (
      select count(*) from public.store_orders where shop_id = p_shop_id and status = 'pending'
    ),
    'total_products', (
      select count(*) from public.products where shop_id = p_shop_id
    ),
    'low_stock_count', (
      select count(*) from public.products
      where shop_id = p_shop_id and is_active and stock_quantity < 5
    )
  ) into res;

  return res;
end;
$$;
revoke all on function public.get_store_owner_stats(text) from public;
grant execute on function public.get_store_owner_stats(text) to authenticated;

alter table public.store_orders replica identity full;
alter table public.bookings replica identity full;
alter table public.products replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_orders'
  ) then execute 'alter publication supabase_realtime add table public.store_orders'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then execute 'alter publication supabase_realtime add table public.bookings'; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then execute 'alter publication supabase_realtime add table public.products'; end if;
end $$;
