-- PitStop 2.0 — migrate existing Supabase project to users + branches model
-- Run AFTER the old schema.sql was already applied.
-- Safe to re-run: uses IF NOT EXISTS / conditional alters where possible.

-- ---------------------------------------------------------------------------
-- 1) Extend enums
-- ---------------------------------------------------------------------------

do $$ begin
  alter type public.user_role add value if not exists 'branch_manager';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.booking_status add value if not exists 'in_progress';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.booking_status add value if not exists 'no_show';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shop_operating_status as enum ('open', 'closed', 'busy', 'vacation');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2) profiles → users (rename if profiles exists, else create users)
-- ---------------------------------------------------------------------------

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

-- Backfill owners from shops.owner_email
insert into public.users (id, email, full_name, role, shop_id)
select
  s.owner_user_id,
  lower(s.owner_email),
  s.name,
  'owner'::public.user_role,
  s.id
from public.shops s
where s.owner_user_id is not null
on conflict (id) do update set
  role = 'owner'::public.user_role,
  shop_id = excluded.shop_id,
  email = excluded.email,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Branches + employees + branch services
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

alter table public.users
  drop constraint if exists users_branch_id_fkey;
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

-- Seed one default branch per shop from legacy shop row (idempotent)
insert into public.shop_branches (
  shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
  latitude, longitude, profile_name, profile_name_ar, is_default, sort_order
)
select
  s.id,
  'main',
  s.name,
  s.name_ar,
  s.area_id,
  s.address,
  s.address_ar,
  s.phone,
  s.latitude,
  s.longitude,
  s.name,
  s.name_ar,
  true,
  0
from public.shops s
where not exists (
  select 1 from public.shop_branches b where b.shop_id = s.id and b.slug = 'main'
);

-- ---------------------------------------------------------------------------
-- 4) Bookings extras
-- ---------------------------------------------------------------------------

alter table public.shops add column if not exists is_active boolean not null default true;
alter table public.shops add column if not exists updated_at timestamptz not null default now();

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
where b.branch_id is null
  and sb.shop_id = b.shop_id
  and sb.slug = 'main';

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

-- ---------------------------------------------------------------------------
-- 5) Auth trigger + helper functions (same as schema.sql)
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
-- 6) Helper functions + RLS refresh
-- Run the "Role helpers" and "Row level security" sections from schema.sql next.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Users can update own profile" on public.users;
