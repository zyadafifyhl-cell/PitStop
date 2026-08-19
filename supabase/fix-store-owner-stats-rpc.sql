-- Shop-scoped dashboard statistics used by lib/store/storeStatsRepository.ts.
-- Run this in the Supabase SQL editor if get_store_owner_stats returns 404.

-- PitStop shops use text IDs (for example, shop-accessories-...), so the
-- ownership columns and RPC parameter must also use text.
alter table public.products
  add column if not exists shop_id text references public.shops(id) on delete cascade;

alter table public.store_orders
  add column if not exists shop_id text references public.shops(id) on delete set null;

create index if not exists products_shop_id_idx on public.products (shop_id);
create index if not exists store_orders_shop_id_idx on public.store_orders (shop_id, created_at desc);

create or replace function public.get_store_owner_stats(p_shop_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if not (
    public.is_platform_admin()
    or exists (
      select 1
      from public.shops s
      where s.id = p_shop_id
        and lower(s.owner_email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
        and s.is_active = true
    )
  ) then
    raise exception 'Unauthorized';
  end if;

  select json_build_object(
    'total_revenue',
      coalesce(sum(case when o.status = 'completed' then o.total_price else 0 end), 0),
    'total_orders',
      count(*),
    'pending_orders',
      count(*) filter (where o.status = 'pending'),
    'total_products',
      (select count(*) from public.products p where p.shop_id = p_shop_id and p.is_active = true),
    'low_stock_count',
      (
        select count(*)
        from public.products p
        where p.shop_id = p_shop_id
          and p.stock_quantity < 5
          and p.is_active = true
      )
  )
  into v_result
  from public.store_orders o
  where o.shop_id = p_shop_id;

  return v_result;
end;
$$;

grant execute on function public.get_store_owner_stats(text) to authenticated;
