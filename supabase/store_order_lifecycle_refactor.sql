-- PitStop retail order lifecycle refactor.
-- Keep enum value `preparing` (displayed as Processing in the UI).
-- Revenue is booked only on `completed`. Cancelling any active/completed
-- order restocks inventory atomically.

-- ---------------------------------------------------------------------------
-- 1. Allowed transitions + auto-restock on cancel
-- ---------------------------------------------------------------------------

create or replace function public.update_store_order_status(
  p_order_id uuid,
  p_new_status public.store_order_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text;
  v_current public.store_order_status;
  v_item record;
  v_allowed boolean := false;
begin
  select shop_id, status into v_shop_id, v_current
  from public.store_orders
  where id = p_order_id
  for update;

  if v_shop_id is null then
    raise exception 'Order not found';
  end if;
  if not (public.is_platform_admin() or public.is_shop_owner(v_shop_id)) then
    raise exception 'Not authorized to update this order';
  end if;
  if v_current = p_new_status then
    return;
  end if;

  if v_current = 'pending' and p_new_status in ('preparing', 'ready', 'cancelled') then
    v_allowed := true;
  elsif v_current = 'preparing' and p_new_status in ('ready', 'cancelled') then
    v_allowed := true;
  elsif v_current = 'ready' and p_new_status in ('completed', 'cancelled') then
    v_allowed := true;
  elsif v_current = 'completed' and p_new_status = 'cancelled' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'Invalid store order transition from % to %', v_current, p_new_status;
  end if;

  if p_new_status = 'cancelled'
     and v_current in ('pending', 'preparing', 'ready', 'completed') then
    perform p.id
    from public.products p
    join public.store_order_items i on i.product_id = p.id
    where i.order_id = p_order_id
    order by p.id
    for update of p;

    for v_item in
      select product_id, quantity
      from public.store_order_items
      where order_id = p_order_id
        and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity,
          updated_at = now()
      where id = v_item.product_id;
    end loop;
  end if;

  update public.store_orders
  set status = p_new_status,
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.update_store_order_status(uuid, public.store_order_status) from public;
grant execute on function public.update_store_order_status(uuid, public.store_order_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Owner stats: revenue is completed-only
-- ---------------------------------------------------------------------------

create or replace function public.get_store_owner_stats(p_shop_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  res json;
begin
  if p_shop_id is null or btrim(p_shop_id) = '' then
    raise exception 'Shop id is required';
  end if;
  if not (public.is_platform_admin() or public.is_shop_owner(p_shop_id)) then
    raise exception 'Not authorized to read store stats';
  end if;

  select json_build_object(
    'total_revenue', coalesce((
      select sum(total_price)
      from public.store_orders
      where shop_id = p_shop_id
        and status = 'completed'
    ), 0),
    'total_orders', (
      select count(*) from public.store_orders where shop_id = p_shop_id
    ),
    'pending_orders', (
      select count(*)
      from public.store_orders
      where shop_id = p_shop_id
        and status = 'pending'
    ),
    'total_products', (
      select count(*)
      from public.products
      where shop_id = p_shop_id
        and is_active = true
    ),
    'low_stock_count', (
      select count(*)
      from public.products
      where shop_id = p_shop_id
        and is_active = true
        and stock_quantity < 5
    )
  ) into res;

  return res;
end;
$$;

revoke all on function public.get_store_owner_stats(text) from public;
grant execute on function public.get_store_owner_stats(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sales report: gross revenue / AOV / top SKUs from completed only
-- ---------------------------------------------------------------------------

create or replace function public.get_store_sales_report(
  p_shop_id text,
  p_start_date timestamptz,
  p_end_date timestamptz
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  res json;
begin
  if p_shop_id is null or btrim(p_shop_id) = '' then
    raise exception 'Shop id is required';
  end if;
  if not (public.is_platform_admin() or public.is_shop_owner(p_shop_id)) then
    raise exception 'Not authorized to read store sales report';
  end if;

  v_start := coalesce(p_start_date, timestamptz '1970-01-01');
  v_end := coalesce(p_end_date, now());
  if v_end < v_start then
    raise exception 'End date must be on or after start date';
  end if;

  select json_build_object(
    'gross_revenue', coalesce((
      select sum(o.total_price)
      from public.store_orders o
      where o.shop_id = p_shop_id
        and o.status = 'completed'
        and o.created_at >= v_start
        and o.created_at <= v_end
    ), 0),
    'completed_orders_count', (
      select count(*)
      from public.store_orders o
      where o.shop_id = p_shop_id
        and o.status = 'completed'
        and o.created_at >= v_start
        and o.created_at <= v_end
    ),
    'cancelled_orders_count', (
      select count(*)
      from public.store_orders o
      where o.shop_id = p_shop_id
        and o.status = 'cancelled'
        and o.created_at >= v_start
        and o.created_at <= v_end
    ),
    'average_order_value', coalesce((
      select avg(o.total_price)
      from public.store_orders o
      where o.shop_id = p_shop_id
        and o.status = 'completed'
        and o.created_at >= v_start
        and o.created_at <= v_end
    ), 0),
    'top_selling_products', coalesce((
      select json_agg(row_to_json(ranked) order by ranked.units_sold desc)
      from (
        select
          i.product_id,
          i.product_name,
          sum(i.quantity)::int as units_sold,
          sum(i.line_total) as total_sales
        from public.store_order_items i
        join public.store_orders o on o.id = i.order_id
        where o.shop_id = p_shop_id
          and o.status = 'completed'
          and o.created_at >= v_start
          and o.created_at <= v_end
        group by i.product_id, i.product_name
        order by sum(i.quantity) desc, sum(i.line_total) desc
        limit 10
      ) ranked
    ), '[]'::json)
  ) into res;

  return res;
end;
$$;

revoke all on function public.get_store_sales_report(text, timestamptz, timestamptz) from public;
grant execute on function public.get_store_sales_report(text, timestamptz, timestamptz) to authenticated;
