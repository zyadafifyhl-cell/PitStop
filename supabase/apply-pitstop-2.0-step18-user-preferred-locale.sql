-- PitStop 2.0 — Step 18: Customer language preference on public.users
-- Run in Supabase SQL Editor after prior steps.

alter table public.users
  add column if not exists preferred_locale text
  check (preferred_locale is null or preferred_locale in ('en', 'ar'));

create index if not exists users_preferred_locale_idx
  on public.users (preferred_locale)
  where preferred_locale is not null;
