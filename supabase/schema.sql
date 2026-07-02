-- PitStop 2.0 — core schema (fresh Supabase project)
-- Run this file first, then supabase/seed.sql and supabase/seed-branches.sql
--
-- Identity: auth.users (Supabase Auth) + public.users (app profile & role)
-- Business: shops (brand) → shop_branches → branch_employees (no login)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.shop_type as enum ('maintenance', 'wash', 'parts', 'accessories', 'winch');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.booking_status as enum (
    'pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.booking_type as enum ('app', 'walk_in');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.parts_order_status as enum ('pending', 'confirmed', 'cancelled', 'shipped');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_category as enum ('parts', 'accessories');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_role as enum ('customer', 'owner', 'branch_manager', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shop_operating_status as enum ('open', 'closed', 'busy', 'vacation');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

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
  is_active boolean not null default true,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_owner_email_idx on public.shops (lower(owner_email));
create index if not exists shops_owner_user_id_idx on public.shops (owner_user_id);

-- ---------------------------------------------------------------------------
-- Users (single app identity table — mirrors auth.users)
-- ---------------------------------------------------------------------------

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role public.user_role not null default 'customer',
  shop_id text references public.shops(id) on delete set null,
  branch_id uuid,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email))
);

create index if not exists users_role_idx on public.users (role);
create index if not exists users_shop_id_idx on public.users (shop_id);
create index if not exists users_branch_id_idx on public.users (branch_id);
create unique index if not exists users_email_unique_idx on public.users (email);

-- ---------------------------------------------------------------------------
-- Branches (physical locations under a shop / brand)
-- ---------------------------------------------------------------------------

create table if not exists public.shop_branches (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  slug text not null default 'main',
  name text not null,
  name_ar text,
  area_id text references public.areas(id),
  address text,
  address_ar text,
  phone text,
  latitude double precision,
  longitude double precision,
  profile_name text,
  profile_name_ar text,
  profile_email text,
  more_info text,
  more_info_ar text,
  profile_image_url text,
  image_urls jsonb not null default '[]'::jsonb,
  service_price_egp numeric(10, 2),
  service_duration_minutes integer not null default 60,
  weekly_hours jsonb not null default '[]'::jsonb,
  shop_status public.shop_operating_status not null default 'open',
  vacation_mode jsonb not null default '{}'::jsonb,
  manager_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, slug)
);

create index if not exists shop_branches_shop_id_idx on public.shop_branches (shop_id);
create index if not exists shop_branches_manager_user_id_idx on public.shop_branches (manager_user_id);

alter table public.users
  drop constraint if exists users_branch_id_fkey;

alter table public.users
  add constraint users_branch_id_fkey
  foreign key (branch_id) references public.shop_branches(id) on delete set null;

alter table public.users
  drop constraint if exists users_branch_manager_has_branch;

alter table public.users
  add constraint users_branch_manager_has_branch check (
    role <> 'branch_manager'::public.user_role or branch_id is not null
  );

alter table public.users
  drop constraint if exists users_owner_has_shop;

alter table public.users
  add constraint users_owner_has_shop check (
    role <> 'owner'::public.user_role or shop_id is not null
  );

-- ---------------------------------------------------------------------------
-- Branch staff (no login accounts)
-- ---------------------------------------------------------------------------

create table if not exists public.branch_employees (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.shop_branches(id) on delete cascade,
  full_name text not null,
  phone text,
  job_title text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists branch_employees_branch_id_idx on public.branch_employees (branch_id);

-- ---------------------------------------------------------------------------
-- Branch services (customer-facing menu per branch)
-- ---------------------------------------------------------------------------

create table if not exists public.branch_services (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.shop_branches(id) on delete cascade,
  name text not null,
  name_ar text,
  description text,
  description_ar text,
  category text,
  price_egp numeric(10, 2) not null default 0,
  duration_minutes integer not null default 30,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists branch_services_branch_id_idx on public.branch_services (branch_id);

-- ---------------------------------------------------------------------------
-- Customer garage + commerce
-- ---------------------------------------------------------------------------

create table if not exists public.garage_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{"v":1,"vehicles":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  branch_id uuid references public.shop_branches(id) on delete set null,
  shop_type public.shop_type not null,
  customer_id uuid references auth.users(id) on delete set null,
  customer_phone text,
  customer_name text,
  car_type text not null,
  car_color text not null default '',
  service_id uuid references public.branch_services(id) on delete set null,
  service_name text,
  service_name_ar text,
  service_price_egp numeric(10, 2) not null default 0,
  platform_fee_egp numeric(10, 2) not null default 0,
  offer_id uuid references public.offers(id) on delete set null,
  customer_notes text,
  owner_rejection_note text,
  booking_type public.booking_type not null default 'app',
  scheduled_at timestamptz not null,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_shop_id_idx on public.bookings (shop_id);
create index if not exists bookings_branch_id_idx on public.bookings (branch_id);
create index if not exists bookings_customer_phone_idx on public.bookings (customer_phone);
create index if not exists bookings_booking_type_idx on public.bookings (booking_type);
create index if not exists bookings_offer_id_idx on public.bookings (offer_id);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  title text not null,
  title_ar text,
  description text not null default '',
  discount_percentage numeric(5, 2) not null default 0
    check (discount_percentage >= 0 and discount_percentage <= 100),
  start_date timestamptz not null default now(),
  end_date timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offers_shop_active_idx on public.offers (shop_id, is_active, end_date desc);
create index if not exists offers_live_idx on public.offers (is_active, start_date, end_date);

create table if not exists public.shop_reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text not null default '',
  likes integer not null default 0,
  liked_by jsonb not null default '[]'::jsonb,
  owner_reply text,
  hidden boolean not null default false,
  reported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_reviews_shop_id_idx on public.shop_reviews (shop_id);
create index if not exists shop_reviews_created_at_idx on public.shop_reviews (shop_id, created_at desc);

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
  branch_id uuid references public.shop_branches(id) on delete cascade,
  owner_email text not null,
  expo_push_token text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  updated_at timestamptz not null default now(),
  unique (shop_id, expo_push_token)
);

-- ---------------------------------------------------------------------------
-- Auth sync: create public.users row when auth.users is created
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, phone, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'phone',
    'customer'::public.user_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.users.full_name),
    phone = coalesce(excluded.phone, public.users.phone),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role helpers (for RLS)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_user()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select u.*
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_shop_owner(p_shop_id text)
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
      and u.is_active
      and u.role = 'owner'::public.user_role
      and u.shop_id = p_shop_id
  )
  or exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_branch_manager(p_branch_id uuid)
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
      and u.is_active
      and u.role = 'branch_manager'::public.user_role
      and u.branch_id = p_branch_id
  );
$$;

create or replace function public.can_manage_shop(p_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_shop_owner(p_shop_id)
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_active
      and u.role = 'branch_manager'::public.user_role
      and u.shop_id = p_shop_id
  );
$$;

create or replace function public.can_manage_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_branch_manager(p_branch_id)
  or exists (
    select 1
    from public.shop_branches b
    where b.id = p_branch_id
      and public.is_shop_owner(b.shop_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.areas enable row level security;
alter table public.shops enable row level security;
alter table public.users enable row level security;
alter table public.shop_branches enable row level security;
alter table public.branch_employees enable row level security;
alter table public.branch_services enable row level security;
alter table public.garage_snapshots enable row level security;
alter table public.bookings enable row level security;
alter table public.offers enable row level security;
alter table public.shop_reviews enable row level security;
alter table public.store enable row level security;
alter table public.parts_orders enable row level security;
alter table public.parts_order_items enable row level security;
alter table public.shop_push_tokens enable row level security;

drop policy if exists "Anyone can read areas" on public.areas;
create policy "Anyone can read areas" on public.areas for select using (true);

drop policy if exists "Anyone can read shops" on public.shops;
create policy "Anyone can read shops" on public.shops for select using (is_active = true);

drop policy if exists "Users can read own row" on public.users;
create policy "Users can read own row" on public.users
  for select using (auth.uid() = id);

drop policy if exists "Users can update own row" on public.users;
create policy "Users can update own row" on public.users
  for update using (auth.uid() = id);

drop policy if exists "Owners can read shop users" on public.users;
create policy "Owners can read shop users" on public.users
  for select using (
    public.is_shop_owner(shop_id)
    or auth.uid() = id
  );

drop policy if exists "Owners can manage branch managers" on public.users;
create policy "Owners can manage branch managers" on public.users
  for all using (
    public.is_shop_owner(shop_id)
    and role = 'branch_manager'::public.user_role
  )
  with check (
    public.is_shop_owner(shop_id)
    and role = 'branch_manager'::public.user_role
  );

drop policy if exists "Anyone can read active branches" on public.shop_branches;
create policy "Anyone can read active branches" on public.shop_branches
  for select using (is_active = true);

drop policy if exists "Owners manage branches" on public.shop_branches;
create policy "Owners manage branches" on public.shop_branches
  for all using (public.is_shop_owner(shop_id))
  with check (public.is_shop_owner(shop_id));

drop policy if exists "Branch managers read own branch" on public.shop_branches;
create policy "Branch managers read own branch" on public.shop_branches
  for select using (public.is_branch_manager(id));

drop policy if exists "Branch managers update own branch" on public.shop_branches;
create policy "Branch managers update own branch" on public.shop_branches
  for update using (public.is_branch_manager(id));

drop policy if exists "Branch staff readable by managers" on public.branch_employees;
create policy "Branch staff readable by managers" on public.branch_employees
  for select using (public.can_manage_branch(branch_id));

drop policy if exists "Branch staff managed by managers" on public.branch_employees;
create policy "Branch staff managed by managers" on public.branch_employees
  for all using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

drop policy if exists "Anyone can read branch services" on public.branch_services;
create policy "Anyone can read branch services" on public.branch_services
  for select using (visible = true);

drop policy if exists "Managers manage branch services" on public.branch_services;
create policy "Managers manage branch services" on public.branch_services
  for all using (public.can_manage_branch(branch_id))
  with check (public.can_manage_branch(branch_id));

drop policy if exists "garage_snapshots_select_own" on public.garage_snapshots;
create policy "garage_snapshots_select_own" on public.garage_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists "garage_snapshots_insert_own" on public.garage_snapshots;
create policy "garage_snapshots_insert_own" on public.garage_snapshots
  for insert with check (auth.uid() = user_id);

drop policy if exists "garage_snapshots_update_own" on public.garage_snapshots;
create policy "garage_snapshots_update_own" on public.garage_snapshots
  for update using (auth.uid() = user_id);

drop policy if exists "Anyone can create bookings" on public.bookings;
create policy "Anyone can create bookings" on public.bookings
  for insert with check (true);

drop policy if exists "Customers can read own bookings" on public.bookings;
create policy "Customers can read own bookings" on public.bookings
  for select using (customer_id = auth.uid());

drop policy if exists "Shop staff can read bookings" on public.bookings;
create policy "Shop staff can read bookings" on public.bookings
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can update bookings" on public.bookings;
create policy "Shop staff can update bookings" on public.bookings
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Customers can cancel own bookings" on public.bookings;
create policy "Customers can cancel own bookings" on public.bookings
  for update using (customer_id = auth.uid())
  with check (status = 'cancelled'::public.booking_status);

drop policy if exists "Customers can delete own bookings" on public.bookings;
create policy "Customers can delete own bookings" on public.bookings
  for delete using (customer_id = auth.uid());

drop policy if exists "Anyone can read live offers" on public.offers;
create policy "Anyone can read live offers" on public.offers
  for select using (
    is_active = true
    and start_date <= now()
    and end_date > now()
  );

drop policy if exists "Shop staff can read shop offers" on public.offers;
create policy "Shop staff can read shop offers" on public.offers
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can insert shop offers" on public.offers;
create policy "Shop staff can insert shop offers" on public.offers
  for insert with check (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can update shop offers" on public.offers;
create policy "Shop staff can update shop offers" on public.offers
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can delete shop offers" on public.offers;
create policy "Shop staff can delete shop offers" on public.offers
  for delete using (public.can_manage_shop(shop_id));

drop policy if exists "Anyone can read visible shop reviews" on public.shop_reviews;
create policy "Anyone can read visible shop reviews" on public.shop_reviews
  for select using (hidden = false);

drop policy if exists "Shop staff can read all shop reviews" on public.shop_reviews;
create policy "Shop staff can read all shop reviews" on public.shop_reviews
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Customers can add shop reviews" on public.shop_reviews;
create policy "Customers can add shop reviews" on public.shop_reviews
  for insert with check (auth.uid() is not null and customer_id = auth.uid());

drop policy if exists "Shop staff can update shop reviews" on public.shop_reviews;
create policy "Shop staff can update shop reviews" on public.shop_reviews
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Customers can update own review likes" on public.shop_reviews;
create policy "Customers can update own review likes" on public.shop_reviews
  for update using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists "Anyone can read store" on public.store;
create policy "Anyone can read store" on public.store for select using (true);

drop policy if exists "Shop owners can manage store" on public.store;
create policy "Shop owners can manage store" on public.store
  for all using (public.is_shop_owner(shop_id))
  with check (public.is_shop_owner(shop_id));

drop policy if exists "Anyone can create parts orders" on public.parts_orders;
create policy "Anyone can create parts orders" on public.parts_orders
  for insert with check (true);

drop policy if exists "Customers can read own parts orders" on public.parts_orders;
create policy "Customers can read own parts orders" on public.parts_orders
  for select using (customer_id = auth.uid());

drop policy if exists "Shop owners can read parts orders" on public.parts_orders;
create policy "Shop owners can read parts orders" on public.parts_orders
  for select using (public.is_shop_owner(shop_id));

drop policy if exists "Shop owners can update parts orders" on public.parts_orders;
create policy "Shop owners can update parts orders" on public.parts_orders
  for update using (public.is_shop_owner(shop_id));

drop policy if exists "Anyone can create parts order items" on public.parts_order_items;
create policy "Anyone can create parts order items" on public.parts_order_items
  for insert with check (true);

drop policy if exists "Shop owners can read parts order items" on public.parts_order_items;
create policy "Shop owners can read parts order items" on public.parts_order_items
  for select using (
    exists (
      select 1
      from public.parts_orders o
      where o.id = parts_order_items.order_id
        and public.is_shop_owner(o.shop_id)
    )
  );

drop policy if exists "Anyone can read shop push tokens" on public.shop_push_tokens;
create policy "Anyone can read shop push tokens" on public.shop_push_tokens
  for select using (true);

drop policy if exists "Anyone can manage shop push tokens" on public.shop_push_tokens;
create policy "Anyone can manage shop push tokens" on public.shop_push_tokens
  for all using (true) with check (true);
