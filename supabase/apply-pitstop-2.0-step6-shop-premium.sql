-- PitStop 2.0 — Step 6: Shop subscription tier (Free vs Premium)
-- Run in Supabase SQL Editor after step5.

alter table public.shops
  add column if not exists is_premium boolean not null default false;

comment on column public.shops.is_premium is
  'When true, wash owner unlocks premium CMS sections (analytics, multi-branch, coupons, staff, reports).';

create index if not exists shops_is_premium_idx on public.shops (is_premium) where is_premium = true;

-- Optional: grant demo wash shop premium for QA
-- update public.shops set is_premium = true where lower(owner_email) = 'wash@demo.com';
