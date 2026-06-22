-- PitStop — run in Supabase SQL editor after creating the project.
-- Enable Phone provider under Authentication → Providers.

create table if not exists public.garage_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null default '{"v":1,"vehicles":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.garage_snapshots enable row level security;

create policy "garage_snapshots_select_own"
  on public.garage_snapshots for select
  using (auth.uid() = user_id);

create policy "garage_snapshots_insert_own"
  on public.garage_snapshots for insert
  with check (auth.uid() = user_id);

create policy "garage_snapshots_update_own"
  on public.garage_snapshots for update
  using (auth.uid() = user_id);

-- Optional profile row (mirrors auth user_metadata.full_name for SQL/reporting).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);
