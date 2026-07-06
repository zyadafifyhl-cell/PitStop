-- PitStop 2.0 — Step 19: Merchant promo coupons + usage tracking
-- Run in Supabase SQL Editor after prior steps.

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops (id) on delete cascade,
  code text not null,
  discount_percentage numeric(10, 2),
  discount_type text check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2),
  global_limit integer,
  per_user_limit integer,
  min_value numeric(10, 2),
  min_order_egp numeric(10, 2),
  is_active boolean not null default true,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);

create index if not exists coupons_shop_active_idx
  on public.coupons (shop_id, is_active, created_at desc);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id text not null,
  booking_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists coupon_usages_coupon_idx on public.coupon_usages (coupon_id);
create index if not exists coupon_usages_user_idx on public.coupon_usages (coupon_id, user_id);

alter table public.coupons enable row level security;
alter table public.coupon_usages enable row level security;

drop policy if exists "Anyone can read active coupons" on public.coupons;
create policy "Anyone can read active coupons" on public.coupons
  for select using (is_active = true);

drop policy if exists "Shop staff can read shop coupons" on public.coupons;
create policy "Shop staff can read shop coupons" on public.coupons
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can insert shop coupons" on public.coupons;
create policy "Shop staff can insert shop coupons" on public.coupons
  for insert with check (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can update shop coupons" on public.coupons;
create policy "Shop staff can update shop coupons" on public.coupons
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can delete shop coupons" on public.coupons;
create policy "Shop staff can delete shop coupons" on public.coupons
  for delete using (public.can_manage_shop(shop_id));

drop policy if exists "Authenticated can read coupon usages" on public.coupon_usages;
create policy "Authenticated can read coupon usages" on public.coupon_usages
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can insert coupon usages" on public.coupon_usages;
create policy "Authenticated can insert coupon usages" on public.coupon_usages
  for insert with check (auth.role() = 'authenticated');
