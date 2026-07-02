-- PitStop 2.0 — Step 11: Shop offers + booking offer linkage
-- Run in Supabase SQL Editor after prior steps.

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

create index if not exists offers_shop_active_idx
  on public.offers (shop_id, is_active, end_date desc);

create index if not exists offers_live_idx
  on public.offers (is_active, start_date, end_date);

alter table public.bookings
  add column if not exists offer_id uuid references public.offers(id) on delete set null;

create index if not exists bookings_offer_id_idx on public.bookings (offer_id);

alter table public.offers enable row level security;

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
