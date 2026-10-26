-- Late-cancellation fees accumulate on the customer account.
-- Each wash/maintenance cancel inside 4 hours adds another 20 EGP.
-- The account balance is the sum of those fees (plus unpaid no-show fees,
-- minus amounts already collected), not a single 20 EGP that never grows.
--
-- Run this in the Supabase SQL editor after late_cancellation_penalty_4h.sql
-- and no_show_penalty_disputes.sql.

-- ---------------------------------------------------------------------------
-- Ledger: every recorded fee, minus what was already collected.
-- ---------------------------------------------------------------------------
create or replace function public.customer_unpaid_penalty_egp(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((
      select sum(b.cancellation_penalty_applied_egp)
      from public.bookings b
      where b.customer_id = p_user_id
    ), 0)
    + coalesce((
      select sum(b.penalty_fee)
      from public.bookings b
      where b.customer_id = p_user_id
        and b.status = 'no_show'::public.booking_status
        and b.dispute_status is distinct from 'waived'
    ), 0)
    - coalesce((
      select sum(c.amount)
      from public.penalty_collections c
      where c.customer_id = p_user_id
    ), 0),
    0
  );
$$;

-- Raise the stored balance up to the real ledger. Never lowers it, so a cancel
-- cannot wipe fees that were only stored on the user row.
create or replace function public.raise_customer_penalty_balance(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_owed numeric(10, 2);
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'Customer profile not found';
  end if;

  v_owed := round(greatest(
    coalesce(v_user.outstanding_penalty_balance, 0),
    coalesce(v_user.pending_penalty_fee_egp, 0),
    public.customer_unpaid_penalty_egp(p_user_id)
  )::numeric, 2);

  update public.users
  set outstanding_penalty_balance = v_owed,
      pending_penalty_fee_egp = v_owed,
      updated_at = now()
  where id = p_user_id;

  return v_owed;
end;
$$;

-- After a collection or a waived dispute, the booking rows are the source of
-- truth and the stored balance must follow them downward.
create or replace function public.sync_customer_penalty_balance(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owed numeric(10, 2);
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Customer profile not found';
  end if;

  v_owed := round(public.customer_unpaid_penalty_egp(p_user_id)::numeric, 2);

  update public.users
  set outstanding_penalty_balance = v_owed,
      pending_penalty_fee_egp = v_owed,
      updated_at = now()
  where id = p_user_id;

  return v_owed;
end;
$$;

create or replace function public.customer_penalty_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_outstanding numeric(10, 2);
  v_pending numeric(10, 2);
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object(
      'outstanding_balance', 0,
      'pending_disputes', 0,
      'collectible_balance', 0
    );
  end if;

  v_outstanding := round(greatest(
    coalesce(v_user.outstanding_penalty_balance, 0),
    coalesce(v_user.pending_penalty_fee_egp, 0),
    public.customer_unpaid_penalty_egp(p_user_id)
  )::numeric, 2);

  select coalesce(sum(b.penalty_fee), 0) into v_pending
  from public.bookings b
  where b.customer_id = p_user_id
    and b.penalty_paid = false
    and b.dispute_status = 'pending';

  return jsonb_build_object(
    'outstanding_balance', v_outstanding,
    'pending_disputes', v_pending,
    'collectible_balance', greatest(v_outstanding - v_pending, 0)
  );
end;
$$;

create or replace function public.get_my_penalty_balance()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.customer_penalty_snapshot(auth.uid());
$$;

create or replace function public.cancel_customer_service_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_collection public.penalty_collections%rowtype;
  v_penalty numeric := 0;
  v_returned numeric(10, 2) := 0;
  v_hours_before numeric;
  v_outstanding numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.customer_id is distinct from auth.uid() then
    raise exception 'Not authorized to cancel this booking';
  end if;
  if v_booking.status in (
    'cancelled'::public.booking_status,
    'done'::public.booking_status,
    'no_show'::public.booking_status
  ) then
    raise exception 'Booking cannot be cancelled in status: %', v_booking.status;
  end if;

  v_hours_before := extract(epoch from (v_booking.scheduled_at - now())) / 3600.0;
  if v_booking.shop_type in (
       'wash'::public.shop_type,
       'detailing_studio'::public.shop_type,
       'maintenance'::public.shop_type
     )
     and v_booking.status in (
       'confirmed'::public.booking_status,
       'in_progress'::public.booking_status
     )
     and v_hours_before < 4 then
    v_penalty := 20;
  end if;

  -- A new booking pulls the current balance off the account. If that booking is
  -- cancelled, the customer never paid those fees, so they go back on the account
  -- and the new 20 EGP late fee is added on top.
  select * into v_collection
  from public.penalty_collections
  where collection_booking_id = p_booking_id
  for update;
  if found then
    v_returned := coalesce(v_collection.amount, 0);
    delete from public.penalty_collections
    where collection_booking_id = p_booking_id;
  end if;

  update public.bookings
  set status = 'cancelled'::public.booking_status,
      cancellation_penalty_applied_egp = v_penalty,
      late_cancelled_at = case when v_penalty > 0 then now() else null end,
      collected_penalty_egp = 0,
      final_amount_paid_egp = greatest(
        coalesce(final_amount_paid_egp, service_price_egp, 0) - v_returned,
        0
      ),
      updated_at = now()
  where id = p_booking_id;

  v_outstanding := public.raise_customer_penalty_balance(auth.uid());

  return jsonb_build_object(
    'success', true,
    'penalty_applied', v_penalty,
    'outstanding_balance', v_outstanding,
    'hours_before', round(v_hours_before::numeric, 2)
  );
end;
$$;

create or replace function public.attach_outstanding_penalty_to_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_collectible numeric(10, 2);
  v_existing public.penalty_collections%rowtype;
  v_snapshot jsonb;
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

  perform 1 from public.users where id = auth.uid() for update;
  if not found then raise exception 'Customer profile not found'; end if;

  v_snapshot := public.customer_penalty_snapshot(auth.uid());
  v_collectible := coalesce((v_snapshot ->> 'collectible_balance')::numeric, 0);
  if v_collectible <= 0 then
    return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', 0);
  end if;

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

  perform public.sync_customer_penalty_balance(auth.uid());

  return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', v_collectible);
end;
$$;

create or replace function public.apply_penalty_payment(
  p_user_id uuid,
  p_paid_amount numeric,
  p_collection_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_collectible numeric(10, 2);
  v_amount numeric(10, 2) := round(coalesce(p_paid_amount, 0)::numeric, 2);
  v_existing public.penalty_collections%rowtype;
  v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_existing
  from public.penalty_collections
  where collection_booking_id = p_collection_booking_id;
  if found then
    return jsonb_build_object('success', true, 'already_applied', true, 'paid_amount', v_existing.amount);
  end if;

  select * into v_booking
  from public.bookings
  where id = p_collection_booking_id
  for update;

  if not found then raise exception 'Collection booking not found'; end if;
  if not public.can_manage_shop(v_booking.shop_id) and not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if v_booking.status <> 'done'::public.booking_status then
    raise exception 'Penalty can only be collected on a completed booking';
  end if;
  if v_booking.customer_id is distinct from p_user_id then
    raise exception 'Collection booking customer mismatch';
  end if;

  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Customer profile not found'; end if;

  v_snapshot := public.customer_penalty_snapshot(p_user_id);
  v_collectible := coalesce((v_snapshot ->> 'collectible_balance')::numeric, 0);
  if v_collectible <= 0 then
    return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', 0);
  end if;
  if v_amount = 0 then
    v_amount := v_collectible;
  end if;
  if v_amount <> v_collectible then
    raise exception 'Paid amount must equal collectible balance of % EGP', v_collectible;
  end if;

  update public.bookings
  set penalty_paid = true,
      updated_at = now()
  where customer_id = p_user_id
    and penalty_fee > 0
    and penalty_paid = false
    and dispute_status in ('none', 'rejected');

  insert into public.penalty_collections (
    customer_id,
    collection_booking_id,
    collecting_shop_id,
    amount
  ) values (
    p_user_id,
    p_collection_booking_id,
    v_booking.shop_id,
    v_amount
  );

  perform public.sync_customer_penalty_balance(p_user_id);

  return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', v_amount);
end;
$$;

-- Repair accounts that are stuck on a single 20 EGP fee.
do $$
declare
  v_user record;
begin
  for v_user in select id from public.users loop
    perform public.raise_customer_penalty_balance(v_user.id);
  end loop;
end;
$$;

revoke all on function public.customer_unpaid_penalty_egp(uuid) from public, anon, authenticated;
revoke all on function public.raise_customer_penalty_balance(uuid) from public, anon, authenticated;
revoke all on function public.sync_customer_penalty_balance(uuid) from public, anon, authenticated;
revoke all on function public.customer_penalty_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.get_my_penalty_balance() from public, anon;
revoke all on function public.cancel_customer_service_booking(uuid) from public, anon;
revoke all on function public.attach_outstanding_penalty_to_booking(uuid) from public, anon;
revoke all on function public.apply_penalty_payment(uuid, numeric, uuid) from public, anon;

grant execute on function public.get_my_penalty_balance() to authenticated;
grant execute on function public.cancel_customer_service_booking(uuid) to authenticated;
grant execute on function public.attach_outstanding_penalty_to_booking(uuid) to authenticated;
grant execute on function public.apply_penalty_payment(uuid, numeric, uuid) to authenticated;
