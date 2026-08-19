-- Allow a customer to cancel their own pending retail order.
-- Restocks inventory using the same lock + increment path as owner cancel.

create or replace function public.cancel_own_store_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status public.store_order_status;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id, status
    into v_user_id, v_status
  from public.store_orders
  where id = p_order_id
  for update;

  if v_user_id is null then
    raise exception 'Order not found';
  end if;
  if v_user_id <> auth.uid() then
    raise exception 'Not authorized to cancel this order';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending orders can be cancelled by the customer';
  end if;

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

  update public.store_orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.cancel_own_store_order(uuid) from public;
grant execute on function public.cancel_own_store_order(uuid) to authenticated;
