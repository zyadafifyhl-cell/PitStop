-- PitStop — In-shop store for every merchant (wash / service / retail)
-- Ensures products.shop_id is mandatory and staff (owner + branch manager) can manage shop products.

-- 1) Mandate shop_id on every product
alter table public.products
  alter column shop_id set not null;

do $$ begin
  alter table public.products
    add constraint products_shop_id_fkey
    foreign key (shop_id) references public.shops(id) on delete cascade;
exception
  when duplicate_object then null;
end $$;

-- 2) RLS: public can read active products; shop staff manage their own catalog
alter table public.products enable row level security;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select using (
    is_active = true
    or public.is_platform_admin()
    or public.can_manage_shop(shop_id)
  );

drop policy if exists "products_owner_insert" on public.products;
create policy "products_owner_insert" on public.products
  for insert with check (
    public.is_platform_admin()
    or public.can_manage_shop(shop_id)
  );

drop policy if exists "products_owner_update" on public.products;
create policy "products_owner_update" on public.products
  for update using (
    public.is_platform_admin()
    or public.can_manage_shop(shop_id)
  )
  with check (
    public.is_platform_admin()
    or public.can_manage_shop(shop_id)
  );

drop policy if exists "products_owner_delete" on public.products;
create policy "products_owner_delete" on public.products
  for delete using (
    public.is_platform_admin()
    or public.can_manage_shop(shop_id)
  );

-- Drop legacy category-only product policies if still present
drop policy if exists "Store owners insert own category products" on public.products;
drop policy if exists "Store owners update own category products" on public.products;
drop policy if exists "Store owners delete own category products" on public.products;
