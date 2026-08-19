-- Preserve the existing checkout API while linking every order to one merchant.
create or replace function public.place_store_order(
  p_fulfillment_method public.store_fulfillment_method,
  p_delivery_fee numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_shop_id text;
  v_shop_count integer;
  v_subtotal numeric(12, 2) := 0;
  v_row record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select count(distinct p.shop_id), min(p.shop_id)
  into v_shop_count, v_shop_id
  from public.cart_items c
  join public.products p on p.id = c.product_id
  where c.user_id = v_user_id
    and p.is_active = true;

  if v_shop_count = 0 or v_shop_id is null then
    raise exception 'Cart is empty';
  end if;
  if v_shop_count > 1 then
    raise exception 'Checkout supports products from one merchant at a time';
  end if;

  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      coalesce(p.sale_price, p.price) as unit_price,
      p.stock_quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
      and p.is_active = true
      and p.shop_id = v_shop_id
  loop
    if v_row.stock_quantity < v_row.quantity then
      raise exception 'Insufficient stock for product %', v_row.product_id;
    end if;
    v_subtotal := v_subtotal + (v_row.unit_price * v_row.quantity);
  end loop;

  insert into public.store_orders (
    user_id, shop_id, subtotal, delivery_fee, total_price, fulfillment_method, status
  )
  values (
    v_user_id, v_shop_id, v_subtotal, coalesce(p_delivery_fee, 0),
    v_subtotal + coalesce(p_delivery_fee, 0), p_fulfillment_method, 'pending'
  )
  returning id into v_order_id;

  for v_row in
    select
      c.product_id,
      c.quantity,
      p.name,
      coalesce(p.sale_price, p.price) as unit_price
    from public.cart_items c
    join public.products p on p.id = c.product_id
    where c.user_id = v_user_id
      and p.is_active = true
      and p.shop_id = v_shop_id
  loop
    insert into public.store_order_items (
      order_id, product_id, product_name, unit_price, quantity, line_total
    )
    values (
      v_order_id, v_row.product_id, v_row.name, v_row.unit_price,
      v_row.quantity, v_row.unit_price * v_row.quantity
    );

    update public.products
    set stock_quantity = stock_quantity - v_row.quantity,
        updated_at = now()
    where id = v_row.product_id
      and stock_quantity >= v_row.quantity;

    if not found then
      raise exception 'Stock changed during checkout for product %', v_row.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = v_user_id;
  return v_order_id;
end;
$$;

grant execute on function public.place_store_order(public.store_fulfillment_method, numeric) to authenticated;
