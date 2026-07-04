-- PitStop 2.0 — Step 14: Per-merchant loyalty points ledger
-- Run in Supabase SQL Editor after steps 1–13.

alter table public.shops
  add column if not exists is_loyalty_enabled boolean not null default true;

comment on column public.shops.is_loyalty_enabled is
  'When false, customers cannot earn or redeem loyalty points at this merchant.';

create table if not exists public.customer_merchant_loyalty (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  shop_id text not null references public.shops(id) on delete cascade,
  points_balance integer not null default 0 check (points_balance >= 0),
  processed_booking_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, shop_id)
);

create index if not exists customer_merchant_loyalty_user_idx
  on public.customer_merchant_loyalty (user_id);

create index if not exists customer_merchant_loyalty_shop_idx
  on public.customer_merchant_loyalty (shop_id);

create index if not exists customer_merchant_loyalty_marketplace_idx
  on public.customer_merchant_loyalty (user_id, points_balance desc)
  where points_balance > 0;

alter table public.customer_merchant_loyalty enable row level security;

drop policy if exists "Customers read own merchant loyalty" on public.customer_merchant_loyalty;
create policy "Customers read own merchant loyalty" on public.customer_merchant_loyalty
  for select using (user_id = auth.uid());

drop policy if exists "Shop owners read merchant loyalty" on public.customer_merchant_loyalty;
create policy "Shop owners read merchant loyalty" on public.customer_merchant_loyalty
  for select using (public.can_manage_shop(shop_id));

comment on table public.customer_merchant_loyalty is
  'Per-customer, per-merchant loyalty points. Earn: 1 pt / EGP 10 net paid on done. Redeem: 10 pts = EGP 1.';

-- Verification
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shops'
      and column_name = 'is_loyalty_enabled'
  ) as shops_loyalty_toggle_ok,
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'customer_merchant_loyalty'
  ) as merchant_loyalty_table_ok;
