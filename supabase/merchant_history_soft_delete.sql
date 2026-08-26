-- Merchant history soft-delete: hide finalized bookings/orders from owner views only.

alter table public.bookings
  add column if not exists is_hidden_by_merchant boolean not null default false;

alter table public.store_orders
  add column if not exists is_hidden_by_merchant boolean not null default false;

create index if not exists bookings_shop_hidden_idx
  on public.bookings (shop_id, is_hidden_by_merchant, scheduled_at desc);

create index if not exists store_orders_shop_hidden_idx
  on public.store_orders (shop_id, is_hidden_by_merchant, created_at desc);

create or replace function public.hide_history_item(
  p_id uuid,
  p_type text,
  p_shop_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(coalesce(p_type, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_id is null or p_shop_id is null then
    raise exception 'Missing history item';
  end if;
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if v_kind in ('booking', 'bookings') then
    update public.bookings
    set is_hidden_by_merchant = true,
        updated_at = now()
    where id = p_id
      and shop_id = p_shop_id;
    if not found then
      raise exception 'Booking not found';
    end if;
    return;
  end if;

  if v_kind in ('store_order', 'store_orders', 'order', 'orders') then
    update public.store_orders
    set is_hidden_by_merchant = true,
        updated_at = now()
    where id = p_id
      and shop_id = p_shop_id;
    if not found then
      raise exception 'Order not found';
    end if;
    return;
  end if;

  raise exception 'Unknown history type %', p_type;
end;
$$;

create or replace function public.clear_all_shop_history(
  p_shop_id text,
  p_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(coalesce(p_type, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_shop_id is null then
    raise exception 'Missing shop';
  end if;
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if v_kind in ('booking', 'bookings') then
    update public.bookings
    set is_hidden_by_merchant = true,
        updated_at = now()
    where shop_id = p_shop_id
      and is_hidden_by_merchant = false
      and (
        status in ('done', 'cancelled', 'no_show')
        or (
          status in ('confirmed', 'in_progress')
          and scheduled_at < now() - interval '1 hour'
        )
      );
    return;
  end if;

  if v_kind in ('store_order', 'store_orders', 'order', 'orders') then
    update public.store_orders
    set is_hidden_by_merchant = true,
        updated_at = now()
    where shop_id = p_shop_id
      and is_hidden_by_merchant = false
      and status in ('completed', 'cancelled');
    return;
  end if;

  raise exception 'Unknown history type %', p_type;
end;
$$;

revoke all on function public.hide_history_item(uuid, text, text) from public;
grant execute on function public.hide_history_item(uuid, text, text) to authenticated;

revoke all on function public.clear_all_shop_history(text, text) from public;
grant execute on function public.clear_all_shop_history(text, text) to authenticated;
