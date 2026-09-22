-- Attach collectible no-show fees to the customer's next booking at create time.
alter table public.bookings
  add column if not exists collected_penalty_egp numeric(10, 2) not null default 0
    check (collected_penalty_egp >= 0);

comment on column public.bookings.collected_penalty_egp is
  'Previous no-show fees collected with this booking and due in cash at the shop.';

create or replace function public.attach_outstanding_penalty_to_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_user public.users%rowtype;
  v_pending_disputes numeric(10, 2);
  v_collectible numeric(10, 2);
  v_existing public.penalty_collections%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_existing
  from public.penalty_collections
  where collection_booking_id = p_booking_id;
  if found then
    return jsonb_build_object('success', true, 'already_applied', true, 'paid_amount', v_existing.amount);
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;
  if v_booking.status not in (
    'pending'::public.booking_status,
    'confirmed'::public.booking_status,
    'in_progress'::public.booking_status,
    'done'::public.booking_status
  ) then
    raise exception 'Penalty cannot be attached to this booking';
  end if;

  select * into v_user from public.users where id = auth.uid() for update;
  if not found then raise exception 'Customer profile not found'; end if;

  select coalesce(sum(penalty_fee), 0) into v_pending_disputes
  from public.bookings
  where customer_id = auth.uid()
    and penalty_paid = false
    and dispute_status = 'pending';

  v_collectible := greatest(coalesce(v_user.outstanding_penalty_balance, 0) - v_pending_disputes, 0);
  if v_collectible <= 0 then
    return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', 0);
  end if;

  update public.users
  set outstanding_penalty_balance = greatest(outstanding_penalty_balance - v_collectible, 0),
      pending_penalty_fee_egp = greatest(pending_penalty_fee_egp - v_collectible, 0),
      updated_at = now()
  where id = auth.uid();

  update public.bookings
  set penalty_paid = true,
      updated_at = now()
  where customer_id = auth.uid()
    and penalty_fee > 0
    and penalty_paid = false
    and dispute_status in ('none', 'rejected');

  update public.bookings
  set collected_penalty_egp = v_collectible,
      final_amount_paid_egp = coalesce(final_amount_paid_egp, service_price_egp, 0) + v_collectible,
      updated_at = now()
  where id = p_booking_id;

  insert into public.penalty_collections (
    customer_id,
    collection_booking_id,
    collecting_shop_id,
    amount
  ) values (
    auth.uid(),
    p_booking_id,
    v_booking.shop_id,
    v_collectible
  );

  return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', v_collectible);
end;
$$;

revoke execute on function public.attach_outstanding_penalty_to_booking(uuid) from public, anon;
grant execute on function public.attach_outstanding_penalty_to_booking(uuid) to authenticated;
