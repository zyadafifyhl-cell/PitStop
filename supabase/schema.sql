-- PitStop — run in Supabase SQL editor after creating the project.
-- Demo catalog rows live in supabase/seed.sql (run that file second).

create extension if not exists pgcrypto;

do $$ begin
  create type public.shop_type as enum ('maintenance', 'wash', 'parts', 'accessories', 'winch');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.parts_order_status as enum ('pending', 'confirmed', 'cancelled', 'shipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_role as enum ('customer', 'owner', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.areas (
  id text primary key,
  name text not null,
  name_ar text not null,
  city text not null,
  city_ar text not null
);

create table if not exists public.shops (
  id text primary key,
  name text not null,
  name_ar text not null,
  type public.shop_type not null,
  area_id text not null references public.areas(id),
  address text not null,
  address_ar text not null,
  phone text not null,
  latitude double precision not null,
  longitude double precision not null,
  owner_email text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  rating numeric(2, 1) default 4.5,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'customer',
  shop_id text references public.shops(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.garage_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null default '{"v":1,"vehicles":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  shop_type public.shop_type not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_phone text not null,
  car_type text not null,
  car_color text not null default '',
  service_price_egp numeric(10, 2) not null default 0,
  platform_fee_egp numeric(10, 2) not null default 0,
  scheduled_at timestamptz not null,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now()
);

do $$ begin
  create type public.store_category as enum ('parts', 'accessories');
exception when duplicate_object then null;
end $$;

create table if not exists public.store (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  category public.store_category not null default 'parts',
  name text not null,
  image_url text,
  price_egp numeric(10, 2) not null default 0,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parts_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_phone text not null,
  shipping_address text not null,
  subtotal_egp numeric(10, 2) not null default 0,
  platform_fee_egp numeric(10, 2) not null default 0,
  total_egp numeric(10, 2) not null default 0,
  status public.parts_order_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.parts_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.parts_orders(id) on delete cascade,
  part_id uuid references public.store(id) on delete set null,
  name text not null,
  qty integer not null check (qty > 0),
  unit_price_egp numeric(10, 2) not null default 0,
  line_total_egp numeric(10, 2) not null default 0
);

create table if not exists public.shop_push_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  owner_email text not null,
  expo_push_token text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  updated_at timestamptz not null default now(),
  unique (shop_id, expo_push_token)
);

alter table public.areas enable row level security;
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.garage_snapshots enable row level security;
alter table public.bookings enable row level security;
alter table public.store enable row level security;
alter table public.parts_orders enable row level security;
alter table public.parts_order_items enable row level security;
alter table public.shop_push_tokens enable row level security;

drop policy if exists "Anyone can read areas" on public.areas;
create policy "Anyone can read areas" on public.areas for select using (true);

drop policy if exists "Anyone can read shops" on public.shops;
create policy "Anyone can read shops" on public.shops for select using (true);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "garage_snapshots_select_own" on public.garage_snapshots;
create policy "garage_snapshots_select_own"
  on public.garage_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "garage_snapshots_insert_own" on public.garage_snapshots;
create policy "garage_snapshots_insert_own"
  on public.garage_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "garage_snapshots_update_own" on public.garage_snapshots;
create policy "garage_snapshots_update_own"
  on public.garage_snapshots for update
  using (auth.uid() = user_id);

drop policy if exists "Anyone can create bookings" on public.bookings;
create policy "Anyone can create bookings" on public.bookings for insert with check (true);

drop policy if exists "Customers can read own bookings" on public.bookings;
create policy "Customers can read own bookings" on public.bookings
for select using (customer_id = auth.uid());

drop policy if exists "Shop owners can read bookings" on public.bookings;
create policy "Shop owners can read bookings" on public.bookings
for select using (
  exists (
    select 1 from public.shops
    where shops.id = bookings.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Shop owners can update bookings" on public.bookings;
create policy "Shop owners can update bookings" on public.bookings
for update using (
  exists (
    select 1 from public.shops
    where shops.id = bookings.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Customers can cancel own bookings" on public.bookings;
create policy "Customers can cancel own bookings" on public.bookings
for update using (customer_id = auth.uid())
with check (status = 'cancelled');

drop policy if exists "Customers can delete own bookings" on public.bookings;
create policy "Customers can delete own bookings" on public.bookings
for delete using (customer_id = auth.uid());

drop policy if exists "Anyone can read store" on public.store;
create policy "Anyone can read store" on public.store for select using (true);

drop policy if exists "Shop owners can manage store" on public.store;
create policy "Shop owners can manage store" on public.store
for all using (
  exists (
    select 1 from public.shops
    where shops.id = store.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
) with check (
  exists (
    select 1 from public.shops
    where shops.id = store.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Anyone can create parts orders" on public.parts_orders;
create policy "Anyone can create parts orders" on public.parts_orders for insert with check (true);

drop policy if exists "Customers can read own parts orders" on public.parts_orders;
create policy "Customers can read own parts orders" on public.parts_orders
for select using (customer_id = auth.uid());

drop policy if exists "Shop owners can read parts orders" on public.parts_orders;
create policy "Shop owners can read parts orders" on public.parts_orders
for select using (
  exists (
    select 1 from public.shops
    where shops.id = parts_orders.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Shop owners can update parts orders" on public.parts_orders;
create policy "Shop owners can update parts orders" on public.parts_orders
for update using (
  exists (
    select 1 from public.shops
    where shops.id = parts_orders.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Anyone can create parts order items" on public.parts_order_items;
create policy "Anyone can create parts order items" on public.parts_order_items for insert with check (true);

drop policy if exists "Shop owners can read parts order items" on public.parts_order_items;
create policy "Shop owners can read parts order items" on public.parts_order_items
for select using (
  exists (
    select 1
    from public.parts_orders
    join public.shops on shops.id = parts_orders.shop_id
    where parts_orders.id = parts_order_items.order_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Anyone can read shop push tokens" on public.shop_push_tokens;
create policy "Anyone can read shop push tokens"
on public.shop_push_tokens for select
using (true);

drop policy if exists "Anyone can manage shop push tokens" on public.shop_push_tokens;
create policy "Anyone can manage shop push tokens"
on public.shop_push_tokens for all
using (true)
with check (true);
