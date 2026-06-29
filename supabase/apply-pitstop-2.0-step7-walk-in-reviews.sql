-- PitStop 2.0 Step 7: Walk-in POS bookings + shop reviews sync
-- Run in Supabase SQL Editor after prior step migrations.

-- ---------------------------------------------------------------------------
-- booking_type enum + column
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.booking_type as enum ('app', 'walk_in');
exception
  when duplicate_object then null;
end $$;

alter table public.bookings
  add column if not exists booking_type public.booking_type not null default 'app';

-- Walk-in customers may not have an app account or phone number.
alter table public.bookings alter column customer_id drop not null;
alter table public.bookings alter column customer_phone drop not null;

create index if not exists bookings_booking_type_idx on public.bookings (booking_type);

comment on column public.bookings.booking_type is
  'app = customer booked via mobile app; walk_in = branch POS / offline registration';

-- ---------------------------------------------------------------------------
-- shop_reviews (synced with owner moderation + customer submission)
-- ---------------------------------------------------------------------------
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

alter table public.shop_reviews enable row level security;

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

-- Reporting note: gross revenue / platform fee queries on public.bookings
-- automatically include walk_in rows (same service_price_egp / platform_fee_egp columns).
