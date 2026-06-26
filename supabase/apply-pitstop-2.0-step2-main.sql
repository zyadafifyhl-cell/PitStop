-- =============================================================================
-- PitStop 2.0 — STEP 2 of 2
-- Run ONLY after step 1 succeeded (apply-pitstop-2.0-step1-enums.sql)
-- =============================================================================

-- spare_parts → store
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'spare_parts'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'store'
  ) then
    alter table public.spare_parts rename to store;
  end if;
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

alter table public.store add column if not exists category public.store_category not null default 'parts';
update public.store set category = 'parts' where category is null;

alter table public.parts_order_items drop constraint if exists parts_order_items_part_id_fkey;
alter table public.parts_order_items
  add constraint parts_order_items_part_id_fkey
  foreign key (part_id) references public.store(id) on delete set null;

-- profiles → users + branches
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    alter table public.profiles rename to users;
  end if;
end $$;

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
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists phone text;
alter table public.users add column if not exists branch_id uuid;
alter table public.users add column if not exists is_active boolean not null default true;
alter table public.users add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.users add column if not exists updated_at timestamptz not null default now();

alter table public.shops add column if not exists is_active boolean not null default true;
alter table public.shops add column if not exists updated_at timestamptz not null default now();

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

alter table public.users drop constraint if exists users_branch_id_fkey;
alter table public.users
  add constraint users_branch_id_fkey
  foreign key (branch_id) references public.shop_branches(id) on delete set null;

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

insert into public.shop_branches (
  shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
  latitude, longitude, profile_name, profile_name_ar, is_default, sort_order
)
select
  s.id, 'main', s.name, s.name_ar, s.area_id, s.address, s.address_ar, s.phone,
  s.latitude, s.longitude, s.name, s.name_ar, true, 0
from public.shops s
where not exists (
  select 1 from public.shop_branches b where b.shop_id = s.id and b.slug = 'main'
);

alter table public.bookings add column if not exists branch_id uuid references public.shop_branches(id) on delete set null;
alter table public.bookings add column if not exists customer_name text;
alter table public.bookings add column if not exists service_id uuid references public.branch_services(id) on delete set null;
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists service_name_ar text;
alter table public.bookings add column if not exists customer_notes text;
alter table public.bookings add column if not exists owner_rejection_note text;
alter table public.bookings add column if not exists updated_at timestamptz not null default now();

update public.bookings b
set branch_id = sb.id
from public.shop_branches sb
where b.branch_id is null and sb.shop_id = b.shop_id and sb.slug = 'main';

insert into public.users (id, email, full_name, phone, role)
select
  au.id,
  lower(au.email),
  coalesce(au.raw_user_meta_data ->> 'name', au.raw_user_meta_data ->> 'full_name'),
  au.raw_user_meta_data ->> 'phone',
  'customer'::public.user_role
from auth.users au
where au.email is not null
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, public.users.full_name),
  phone = coalesce(excluded.phone, public.users.phone),
  updated_at = now();

insert into public.users (id, email, full_name, role, shop_id)
select
  au.id,
  lower(au.email),
  s.name,
  'owner'::public.user_role,
  s.id
from public.shops s
join auth.users au on lower(au.email) = lower(s.owner_email)
on conflict (id) do update set
  role = 'owner'::public.user_role,
  shop_id = excluded.shop_id,
  email = excluded.email,
  updated_at = now();

update public.shops s
set owner_user_id = u.id
from public.users u
where u.shop_id = s.id
  and u.role = 'owner'::public.user_role
  and s.owner_user_id is distinct from u.id;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'shop_push_tokens'
  ) then
    alter table public.shop_push_tokens
      add column if not exists branch_id uuid references public.shop_branches(id) on delete cascade;
  end if;
end $$;

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

create or replace function public.is_shop_owner(p_shop_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role = 'owner'::public.user_role and u.shop_id = p_shop_id
  ) or exists (
    select 1 from public.shops s
    where s.id = p_shop_id
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_branch_manager(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role = 'branch_manager'::public.user_role and u.branch_id = p_branch_id
  );
$$;

create or replace function public.can_manage_shop(p_shop_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_shop_owner(p_shop_id)
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active
      and u.role = 'branch_manager'::public.user_role and u.shop_id = p_shop_id
  );
$$;

create or replace function public.can_manage_branch(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_branch_manager(p_branch_id)
  or exists (
    select 1 from public.shop_branches b
    where b.id = p_branch_id and public.is_shop_owner(b.shop_id)
  );
$$;

alter table public.users enable row level security;
alter table public.shop_branches enable row level security;
alter table public.branch_employees enable row level security;
alter table public.branch_services enable row level security;
alter table public.store enable row level security;

drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Users can read own row" on public.users;
create policy "Users can read own row" on public.users for select using (auth.uid() = id);
drop policy if exists "Users can update own row" on public.users;
create policy "Users can update own row" on public.users for update using (auth.uid() = id);

drop policy if exists "Shop owners can read bookings" on public.bookings;
drop policy if exists "Shop owners can update bookings" on public.bookings;
drop policy if exists "Shop staff can read bookings" on public.bookings;
create policy "Shop staff can read bookings" on public.bookings
  for select using (public.can_manage_shop(shop_id));
drop policy if exists "Shop staff can update bookings" on public.bookings;
create policy "Shop staff can update bookings" on public.bookings
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Anyone can read spare parts" on public.store;
drop policy if exists "Shop owners can manage spare parts" on public.store;
drop policy if exists "Anyone can read store" on public.store;
create policy "Anyone can read store" on public.store for select using (true);
drop policy if exists "Shop owners can manage store" on public.store;
create policy "Shop owners can manage store" on public.store
  for all using (public.is_shop_owner(shop_id))
  with check (public.is_shop_owner(shop_id));

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
