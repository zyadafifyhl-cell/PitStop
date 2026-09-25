-- Customer "Erase history": hide finalized bookings/orders from the customer only.
-- Hard delete fails when penalty_collections references a booking (ON DELETE RESTRICT).

alter table public.bookings
  add column if not exists is_hidden_by_customer boolean not null default false;

alter table public.store_orders
  add column if not exists is_hidden_by_customer boolean not null default false;

create index if not exists bookings_customer_hidden_idx
  on public.bookings (customer_id, is_hidden_by_customer, scheduled_at desc);

create index if not exists store_orders_customer_hidden_idx
  on public.store_orders (user_id, is_hidden_by_customer, created_at desc);

drop policy if exists "Customers can hide own booking history" on public.bookings;
create policy "Customers can hide own booking history"
  on public.bookings for update
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid() and is_hidden_by_customer = true);

create or replace function public.clear_customer_booking_history(p_phones text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.bookings
  set is_hidden_by_customer = true,
      updated_at = now()
  where is_hidden_by_customer = false
    and (
      customer_id = auth.uid()
      or (
        cardinality(coalesce(p_phones, '{}')) > 0
        and customer_phone = any(p_phones)
        and (customer_id is null or customer_id = auth.uid())
      )
    )
    and (
      status in ('done', 'cancelled', 'no_show', 'suspended_by_shop')
      or (
        status in ('confirmed', 'in_progress', 'pending')
        and scheduled_at < now() - interval '1 hour'
      )
    );
  get diagnostics v_count = row_count;

  update public.store_orders
  set is_hidden_by_customer = true,
      updated_at = now()
  where is_hidden_by_customer = false
    and user_id = auth.uid()
    and status in ('completed', 'cancelled');

  return v_count;
end;
$$;

revoke all on function public.clear_customer_booking_history(text[]) from public;
grant execute on function public.clear_customer_booking_history(text[]) to authenticated;
