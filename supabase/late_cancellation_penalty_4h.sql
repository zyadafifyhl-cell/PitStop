-- PitStop — Late cancellation penalty (4-hour rule, 20 EGP)
-- Apply in the Supabase SQL Editor (or psql) against the project database.
--
-- Rules:
--   • Customer cancels a wash/maintenance booking < 4 hours before scheduled_at
--     → charge 20 EGP onto public.users.pending_penalty_fee_egp
--   • Free cancellation when ≥ 4 hours remain
--   • Atomic SECURITY DEFINER RPC; ownership checked via auth.uid()

-- ---------------------------------------------------------------------------
-- 1. Track unpaid penalties per customer
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists pending_penalty_fee_egp numeric not null default 0
    check (pending_penalty_fee_egp >= 0);

comment on column public.users.pending_penalty_fee_egp is
  'Accumulated unpaid late-cancellation penalties in EGP (settled outside this RPC).';

-- ---------------------------------------------------------------------------
-- 2. Track applied penalty audit on bookings
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists cancellation_penalty_applied_egp numeric not null default 0
    check (cancellation_penalty_applied_egp >= 0);

alter table public.bookings
  add column if not exists late_cancelled_at timestamptz;

comment on column public.bookings.cancellation_penalty_applied_egp is
  'Penalty EGP charged when the customer late-cancelled this booking (0 if free cancel).';

comment on column public.bookings.late_cancelled_at is
  'Timestamp when a late cancellation penalty was applied; null if free cancel.';

-- ---------------------------------------------------------------------------
-- 3. Atomic customer booking cancellation RPC with 4-hour rule
-- ---------------------------------------------------------------------------
create or replace function public.cancel_customer_service_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_penalty numeric := 0;
  v_hours_before numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
    into v_booking
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

  -- Hours remaining until the appointment (negative if already past scheduled_at).
  v_hours_before := extract(epoch from (v_booking.scheduled_at - now())) / 3600.0;

  -- 4-hour rule for wash & maintenance service bookings only.
  if v_booking.shop_type in (
       'wash'::public.shop_type,
       'maintenance'::public.shop_type
     )
     and v_hours_before < 4 then
    v_penalty := 20;

    update public.users
    set pending_penalty_fee_egp = coalesce(pending_penalty_fee_egp, 0) + v_penalty,
        updated_at = now()
    where id = auth.uid();
  end if;

  update public.bookings
  set status = 'cancelled'::public.booking_status,
      cancellation_penalty_applied_egp = v_penalty,
      late_cancelled_at = case when v_penalty > 0 then now() else null end,
      updated_at = now()
  where id = p_booking_id;

  return jsonb_build_object(
    'success', true,
    'penalty_applied', v_penalty,
    'hours_before', round(v_hours_before::numeric, 2)
  );
end;
$$;

revoke all on function public.cancel_customer_service_booking(uuid) from public;
grant execute on function public.cancel_customer_service_booking(uuid) to authenticated;

comment on function public.cancel_customer_service_booking(uuid) is
  'Customer cancels own service booking. Applies 20 EGP penalty when wash/maintenance cancel is < 4h before scheduled_at.';
