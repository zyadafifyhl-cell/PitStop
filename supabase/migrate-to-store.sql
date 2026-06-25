-- Run once if your project still has spare_parts (existing CareCare DB).
-- Safe to skip on fresh installs that already use supabase/schema.sql with store.

do $$ begin
  alter type public.shop_type add value if not exists 'accessories';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_category as enum ('parts', 'accessories');
exception when duplicate_object then null;
end $$;

alter table if exists public.spare_parts rename to store;

alter table public.store
  add column if not exists category public.store_category not null default 'parts';

update public.store set category = 'parts' where category is null;

alter table public.parts_order_items drop constraint if exists parts_order_items_part_id_fkey;
alter table public.parts_order_items
  add constraint parts_order_items_part_id_fkey
  foreign key (part_id) references public.store(id) on delete set null;

alter table public.store enable row level security;

drop policy if exists "Anyone can read spare parts" on public.store;
drop policy if exists "Shop owners can manage spare parts" on public.store;
drop policy if exists "Anyone can read store" on public.store;
drop policy if exists "Shop owners can manage store" on public.store;

create policy "Anyone can read store" on public.store for select using (true);

create policy "Shop owners can manage store" on public.store
for all using (
  exists (
    select 1 from public.shops
    where shops.id = store.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
) with check (
  exists (
    select 1 from public.shops
    where shops.id = store.shop_id
    and lower(shops.owner_email) = lower(auth.jwt() ->> 'email')
  )
);
