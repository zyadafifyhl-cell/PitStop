-- PitStop 2.0 — Step 25: Store owner product management (sale price + RLS)

alter table public.products
  add column if not exists sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0);

create or replace function public.can_manage_store_products(p_category public.store_product_category)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.users u
      join public.shops s on s.id = u.shop_id
      where u.id = auth.uid()
        and u.role = 'owner'
        and u.is_active = true
        and (
          (s.type = 'parts' and p_category = 'spare_parts')
          or (s.type = 'accessories' and p_category = 'accessories')
        )
    );
$$;

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update" on public.products
  for update using (public.can_manage_store_products(category));

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert" on public.products
  for insert with check (public.can_manage_store_products(category));
