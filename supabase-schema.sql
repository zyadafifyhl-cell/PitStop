create extension if not exists pgcrypto;

do $$ begin
  create type public.shop_type as enum ('maintenance', 'wash', 'parts', 'winch');
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

create table if not exists public.spare_parts (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
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
  part_id uuid references public.spare_parts(id) on delete set null,
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
alter table public.bookings enable row level security;
alter table public.spare_parts enable row level security;
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

drop policy if exists "Anyone can read spare parts" on public.spare_parts;
create policy "Anyone can read spare parts" on public.spare_parts for select using (true);

drop policy if exists "Shop owners can manage spare parts" on public.spare_parts;
create policy "Shop owners can manage spare parts" on public.spare_parts
for all using (
  exists (
    select 1 from public.shops
    where shops.id = spare_parts.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
) with check (
  exists (
    select 1 from public.shops
    where shops.id = spare_parts.shop_id
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

insert into public.areas (id, name, name_ar, city, city_ar) values
  ('maadi', 'Maadi', 'المعادي', 'Cairo', 'القاهرة'),
  ('nasr-city', 'Nasr City', 'مدينة نصر', 'Cairo', 'القاهرة'),
  ('mohandessin', 'Mohandessin', 'المهندسين', 'Giza', 'الجيزة'),
  ('october', '6th October', '6 أكتوبر', 'Giza', 'الجيزة'),
  ('heliopolis', 'Heliopolis', 'مصر الجديدة', 'Cairo', 'القاهرة')
on conflict (id) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  city = excluded.city,
  city_ar = excluded.city_ar;

insert into public.shops
  (id, name, name_ar, type, area_id, address, address_ar, phone, latitude, longitude, owner_email, rating)
values
  ('shop-wash-nile', 'Nile Auto Wash', 'مغسلة النيل', 'wash', 'maadi', 'Street 9, Maadi', 'شارع 9، المعادي', '+201022334455', 29.9602, 31.2569, 'wash@demo.com', 4.8),
  ('shop-wash-city', 'City Shine Wash', 'مغسلة سيتي شاين', 'wash', 'nasr-city', 'Abbas El Akkad St.', 'شارع عباس العقاد', '+201055667788', 30.0511, 31.3656, 'wash2@demo.com', 4.6),
  ('shop-wash-mohandessin', 'Premium Wash Mohandessin', 'مغسلة Premium المهندسين', 'wash', 'mohandessin', 'Gameat El Dewal', 'جامعة الدول', '+201066778899', 30.0626, 31.2, 'wash3@demo.com', 4.7),
  ('shop-maint-autofix', 'AutoFix Service Center', 'مركز AutoFix للصيانة', 'maintenance', 'october', 'Industrial Zone, 6th October', 'المنطقة الصناعية، 6 أكتوبر', '+201011223344', 29.9285, 30.9188, 'maintenance@demo.com', 4.9),
  ('shop-maint-elite', 'Elite Motors Workshop', 'ورشة Elite Motors', 'maintenance', 'heliopolis', 'El Merghany St.', 'شارع الميرغني', '+201077889900', 30.0875, 31.324, 'maintenance2@demo.com', 4.7),
  ('shop-maint-maadi', 'Maadi Motors Care', 'ماادي موتورز للصيانة', 'maintenance', 'maadi', 'Road 232, Maadi', 'الطريق 232، المعادي', '+201088990011', 29.967, 31.249, 'maintenance3@demo.com', 4.5),
  ('shop-winch-maadi', 'Maadi Rescue Winch', 'ونش إنقاذ المعادي', 'winch', 'maadi', 'Road 9, Maadi', 'طريق 9، المعادي', '+201010101010', 29.9612, 31.2575, 'winch@demo.com', 4.8),
  ('shop-winch-nasr', 'Nasr City Tow Service', 'خدمة ونش مدينة نصر', 'winch', 'nasr-city', 'Makram Ebeid, Nasr City', 'مكرم عبيد، مدينة نصر', '+201020202020', 30.0566, 31.3433, 'winch2@demo.com', 4.6),
  ('shop-parts-nasr', 'Nasr Auto Parts', 'قطع غيار مدينة نصر', 'parts', 'nasr-city', 'Suez Road, Nasr City', 'طريق السويس، مدينة نصر', '+201033445566', 30.059, 31.338, 'parts@demo.com', 4.4),
  ('shop-parts-maadi', 'Maadi Spare Parts Hub', 'مركز قطع غيار المعادي', 'parts', 'maadi', 'Degla Square', 'ميدان دجلة', '+201044556677', 29.955, 31.262, 'parts2@demo.com', 4.6)
on conflict (id) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  type = excluded.type,
  area_id = excluded.area_id,
  address = excluded.address,
  address_ar = excluded.address_ar,
  phone = excluded.phone,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  owner_email = excluded.owner_email,
  rating = excluded.rating;

insert into public.spare_parts (shop_id, name, image_url, price_egp, stock_qty) values
  ('shop-parts-nasr', 'Brake Pads', null, 850, 12),
  ('shop-parts-nasr', 'Engine Oil 5W-30', null, 620, 20),
  ('shop-parts-maadi', 'Air Filter', null, 280, 15),
  ('shop-parts-maadi', 'Battery 70Ah', null, 2600, 6);
