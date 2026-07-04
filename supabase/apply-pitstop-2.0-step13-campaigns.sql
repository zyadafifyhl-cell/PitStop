-- PitStop 2.0 — Step 13: Marketing Offers & Campaigns
-- Extends public.offers with multi-type campaign fields + Realtime.
-- Run in Supabase SQL Editor after step 11.

alter table public.offers
  add column if not exists offer_type text not null default 'percentage'
    check (offer_type in ('percentage', 'flat_amount', 'buy_x_get_y')),
  add column if not exists discount_value numeric(10, 2) not null default 0
    check (discount_value >= 0),
  add column if not exists required_wash_count integer not null default 0
    check (required_wash_count >= 0),
  add column if not exists expires_at timestamptz;

-- Backfill legacy percentage rows into new columns.
update public.offers
set
  offer_type = 'percentage',
  discount_value = coalesce(discount_percentage, 0),
  expires_at = coalesce(end_date, created_at + interval '7 days')
where discount_value = 0
  and offer_type = 'percentage';

create index if not exists offers_shop_live_v2_idx
  on public.offers (shop_id, is_active, expires_at desc);

create index if not exists offers_live_v2_idx
  on public.offers (is_active, expires_at)
  where is_active = true;

drop policy if exists "Anyone can read live offers" on public.offers;
create policy "Anyone can read live offers" on public.offers
  for select using (
    is_active = true
    and start_date <= now()
    and (expires_at is null or expires_at > now())
    and end_date > now()
  );

-- Enable Realtime for instant customer home / shop card refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'offers'
  ) then
    alter publication supabase_realtime add table public.offers;
  end if;
end $$;
