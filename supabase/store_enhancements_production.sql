-- PitStop store production enhancements.
-- Multi-image products, restock on cancel, sales report RPC, per-shop checkout.

-- ---------------------------------------------------------------------------
-- A. Multi-image support
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists image_urls text[] not null default '{}'::text[];

do $$ begin
  alter table public.products
    add constraint products_image_urls_max_len
    check (cardinality(image_urls) <= 5);
exception when duplicate_object then null; end $$;

update public.products
set image_urls = array[image_url]
where coalesce(image_url, '') <> ''
  and cardinality(coalesce(image_urls, '{}'::text[])) = 0;

create or replace function public.sync_product_primary_image()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_urls text[];
  v_primary text;
begin
  v_urls := coalesce(new.image_urls, '{}'::text[]);
  v_urls := array(
    select btrim(u)
    from unnest(v_urls) as u
    where btrim(coalesce(u, '')) <> ''
  );
  if cardinality(v_urls) > 5 then
    v_urls := v_urls[1:5];
  end if;

  v_primary := nullif(btrim(coalesce(new.image_url, '')), '');
  if cardinality(v_urls) = 0 and v_primary is not null then
    v_urls := array[v_primary];
  end if;

  new.image_urls := v_urls;
  new.image_url := case when cardinality(v_urls) > 0 then v_urls[1] else null end;
  return new;
end;
$$;

drop trigger if exists products_sync_primary_image on public.products;
create trigger products_sync_primary_image
before insert or update of image_url, image_urls on public.products
for each row execute function public.sync_product_primary_image();

-- ---------------------------------------------------------------------------
-- B. Auto-restock on cancellation + status update
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

  if p_new_status = 'cancelled'
     and v_current in ('pending', 'preparing') then
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
-- C. Store sales & revenue report
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

-- ---------------------------------------------------------------------------
-- Per-shop checkout so mixed carts can be fulfilled one merchant at a time
-- ---------------------------------------------------------------------------

drop function if exists public.place_store_order(public.store_fulfillment_method, numeric);
drop function if exists public.place_store_order(public.store_fulfillment_method, numeric, text, text, text, text);
drop function if exists public.place_store_order(public.store_fulfillment_method, numeric, text, text, text, text, text);

create or replace function public.place_store_order(
  p_fulfillment_method public.store_fulfillment_method,
  p_delivery_fee numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_delivery_address text default null,
  p_notes text default null,
  p_shop_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_shop_id text;
  v_cart_count integer;
  v_shop_count integer;
  v_invalid_count integer;
  v_subtotal numeric(12,2) := 0;
  v_customer_name text;
  v_customer_phone text;
  v_row record;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if coalesce(p_delivery_fee, 0) < 0 then raise exception 'Delivery fee cannot be negative'; end if;

  select
    count(*),
    count(distinct p.shop_id),
    min(p.shop_id),
    count(*) filter (where p.id is null or p.shop_id is null or not p.is_active)
  into v_cart_count, v_shop_count, v_shop_id, v_invalid_count
  from public.cart_items c
  left join public.products p on p.id = c.product_id
  where c.user_id = v_user_id
    and (p_shop_id is null or p.shop_id = p_shop_id);

  if v_cart_count = 0 then raise exception 'Cart is empty'; end if;
  if v_invalid_count > 0 then raise exception 'Cart contains unavailable products'; end if;
  if v_shop_count <> 1 or v_shop_id is null then
    raise exception 'Checkout supports products from one merchant at a time';
  end if;
  if p_shop_id is not null and v_shop_id is distinct from p_shop_id then
    raise exception 'Checkout shop does not match cart items';
  end if;
  if not exists (select 1 from public.shops where id = v_shop_id and is_active) then
    raise exception 'Store is currently unavailable';
  end if;

  perform p.id
  from public.products p
  join public.cart_items c on c.product_id = p.id
  where c.user_id = v_user_id
    and p.shop_id = v_shop_id
  order by p.id
  for update of p;

  for v_row in
    select c.product_id, c.quantity, p.name,
           coalesce(p.sale_price, p.price) as unit_price,
           p.stock_quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id and p.shop_id = v_shop_id and p.is_active
  loop
    if v_row.stock_quantity < v_row.quantity then
      raise exception 'Insufficient stock for product % (available %, requested %)',
        v_row.product_id, v_row.stock_quantity, v_row.quantity;
    end if;
    v_subtotal := v_subtotal + (v_row.unit_price * v_row.quantity);
  end loop;

  select coalesce(p_customer_name, u.full_name), coalesce(p_customer_phone, u.phone)
  into v_customer_name, v_customer_phone
  from public.users u where u.id = v_user_id;

  insert into public.store_orders (
    user_id, shop_id, customer_name, customer_phone, delivery_address,
    delivery_notes, notes, subtotal, delivery_fee, total_price,
    fulfillment_method, payment_method, status
  ) values (
    v_user_id, v_shop_id, v_customer_name, v_customer_phone, nullif(trim(p_delivery_address), ''),
    nullif(trim(p_notes), ''), nullif(trim(p_notes), ''), v_subtotal, coalesce(p_delivery_fee, 0),
    v_subtotal + coalesce(p_delivery_fee, 0), p_fulfillment_method,
    p_fulfillment_method::text, 'pending'
  ) returning id into v_order_id;

  for v_row in
    select c.product_id, c.quantity, p.name, coalesce(p.sale_price, p.price) as unit_price
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id and p.shop_id = v_shop_id and p.is_active
  loop
    insert into public.store_order_items (
      order_id, product_id, product_name, unit_price, quantity, line_total
    ) values (
      v_order_id, v_row.product_id, v_row.name, v_row.unit_price,
      v_row.quantity, v_row.unit_price * v_row.quantity
    );
    update public.products
    set stock_quantity = stock_quantity - v_row.quantity, updated_at = now()
    where id = v_row.product_id and stock_quantity >= v_row.quantity;
    if not found then
      raise exception 'Insufficient stock for product % (stock changed during checkout)', v_row.product_id;
    end if;
  end loop;

  delete from public.cart_items c
  using public.products p
  where c.user_id = v_user_id
    and c.product_id = p.id
    and p.shop_id = v_shop_id;

  return v_order_id;
end;
$$;

revoke all on function public.place_store_order(
  public.store_fulfillment_method, numeric, text, text, text, text, text
) from public;
grant execute on function public.place_store_order(
  public.store_fulfillment_method, numeric, text, text, text, text, text
) to authenticated;
