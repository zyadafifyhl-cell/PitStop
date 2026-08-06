-- PitStop 2.0 — customer garage vehicles (persistent across sessions)
-- Each row belongs to auth.users via user_id; RLS restricts access to the owner.

create table if not exists public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  make_model text not null,
  color text,
  plate text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_vehicles_user_id_idx on public.user_vehicles (user_id);
create index if not exists user_vehicles_user_active_idx on public.user_vehicles (user_id, is_active);

alter table public.user_vehicles enable row level security;

drop policy if exists "user_vehicles_select_own" on public.user_vehicles;
create policy "user_vehicles_select_own" on public.user_vehicles
  for select using (auth.uid() = user_id);

drop policy if exists "user_vehicles_insert_own" on public.user_vehicles;
create policy "user_vehicles_insert_own" on public.user_vehicles
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_vehicles_update_own" on public.user_vehicles;
create policy "user_vehicles_update_own" on public.user_vehicles
  for update using (auth.uid() = user_id);

drop policy if exists "user_vehicles_delete_own" on public.user_vehicles;
create policy "user_vehicles_delete_own" on public.user_vehicles
  for delete using (auth.uid() = user_id);
