-- PitStop 2.0 — Step 16: Shop financial report history (PDF ledger)
-- Run in Supabase SQL Editor after prior steps.

create table if not exists public.shop_report_history (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  branch_id text,
  scope text not null check (scope in ('branch', 'all')),
  range_start timestamptz not null,
  range_end timestamptz not null,
  generated_at timestamptz not null default now(),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  gross_egp numeric(12, 2) not null default 0,
  platform_fee_egp numeric(12, 2) not null default 0,
  net_egp numeric(12, 2) not null default 0,
  booking_count integer not null default 0,
  title text not null,
  body text not null default '',
  report_html text not null,
  created_at timestamptz not null default now()
);

create index if not exists shop_report_history_shop_generated_idx
  on public.shop_report_history (shop_id, generated_at desc);

create index if not exists shop_report_history_shop_branch_idx
  on public.shop_report_history (shop_id, branch_id, generated_at desc);

alter table public.shop_report_history enable row level security;

drop policy if exists "Shop staff can read report history" on public.shop_report_history;
create policy "Shop staff can read report history" on public.shop_report_history
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can insert report history" on public.shop_report_history;
create policy "Shop staff can insert report history" on public.shop_report_history
  for insert with check (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff can delete report history" on public.shop_report_history;
create policy "Shop staff can delete report history" on public.shop_report_history
  for delete using (public.can_manage_shop(shop_id));
