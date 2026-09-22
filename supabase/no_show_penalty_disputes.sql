-- PitStop — no-show penalties, cash collection, and disputes.
-- Service payments are collected in cash by the shop. When the collecting
-- booking is completed, the penalty becomes a PitStop receivable from that shop.

alter table public.users
  add column if not exists outstanding_penalty_balance numeric(10, 2) not null default 0
    check (outstanding_penalty_balance >= 0);

-- Preserve balances created by the existing late-cancellation feature.
update public.users
set outstanding_penalty_balance = greatest(
  outstanding_penalty_balance,
  coalesce(pending_penalty_fee_egp, 0)
);

alter table public.bookings
  add column if not exists penalty_fee numeric(10, 2) not null default 0
    check (penalty_fee >= 0),
  add column if not exists penalty_paid boolean not null default false,
  add column if not exists dispute_status text not null default 'none'
    check (dispute_status in ('none', 'pending', 'waived', 'rejected')),
  add column if not exists dispute_reason text,
  add column if not exists dispute_resolved_at timestamptz,
  add column if not exists dispute_resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists no_show_marked_at timestamptz;

create index if not exists bookings_pending_penalty_disputes_idx
  on public.bookings (dispute_status, created_at desc)
  where dispute_status = 'pending';

create index if not exists bookings_customer_unpaid_penalties_idx
  on public.bookings (customer_id, penalty_paid, created_at)
  where penalty_fee > 0;
create index if not exists bookings_dispute_resolved_by_idx
  on public.bookings (dispute_resolved_by)
  where dispute_resolved_by is not null;

create table if not exists public.penalty_collections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  collection_booking_id uuid not null unique references public.bookings(id) on delete restrict,
  collecting_shop_id text not null references public.shops(id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  collected_at timestamptz not null default now(),
  platform_settled_at timestamptz
);

create index if not exists penalty_collections_shop_unsettled_idx
  on public.penalty_collections (collecting_shop_id, collected_at)
  where platform_settled_at is null;
create index if not exists penalty_collections_customer_idx
  on public.penalty_collections (customer_id, collected_at desc);

alter table public.penalty_collections enable row level security;

drop policy if exists "Customers read own penalty collections" on public.penalty_collections;
create policy "Customers read own penalty collections"
  on public.penalty_collections for select
  using (customer_id = auth.uid());

drop policy if exists "Shop staff read collected penalties" on public.penalty_collections;
create policy "Shop staff read collected penalties"
  on public.penalty_collections for select
  using (public.can_manage_shop(collecting_shop_id));

drop policy if exists "Platform admins read penalty collections" on public.penalty_collections;
create policy "Platform admins read penalty collections"
  on public.penalty_collections for select
  using (public.is_platform_admin());

-- Merchant action. The amount is fixed to 20 EGP for merchants; the argument is
-- retained for API clarity and future admin-adjusted policies.
create or replace function public.mark_booking_no_show(
  p_booking_id uuid,
  p_penalty_amount numeric default 20.00
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_amount numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if not public.can_manage_shop(v_booking.shop_id) and not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if v_booking.shop_type not in ('wash'::public.shop_type, 'maintenance'::public.shop_type) then
    raise exception 'No-show penalties apply to wash and maintenance only';
  end if;
  if v_booking.customer_id is null then
    raise exception 'Booking has no registered customer';
  end if;
  if v_booking.status = 'no_show'::public.booking_status then
    return jsonb_build_object(
      'success', true,
      'already_applied', true,
      'penalty_applied', v_booking.penalty_fee
    );
  end if;
  if v_booking.status not in (
    'confirmed'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    raise exception 'Booking cannot be marked no-show in status: %', v_booking.status;
  end if;

  v_amount := round(coalesce(p_penalty_amount, 20.00)::numeric, 2);
  if v_amount <> 20.00 and not public.is_platform_admin() then
    raise exception 'Merchant no-show penalty must be 20 EGP';
  end if;
  if v_amount < 0 or v_amount > 10000 then
    raise exception 'Invalid penalty amount';
  end if;

  update public.bookings
  set status = 'no_show'::public.booking_status,
      penalty_fee = v_amount,
      penalty_paid = false,
      dispute_status = 'none',
      dispute_reason = null,
      dispute_resolved_at = null,
      dispute_resolved_by = null,
      no_show_marked_at = now(),
      updated_at = now()
  where id = p_booking_id;

  update public.users
  set outstanding_penalty_balance = outstanding_penalty_balance + v_amount,
      pending_penalty_fee_egp = pending_penalty_fee_egp + v_amount,
      updated_at = now()
  where id = v_booking.customer_id;

  if not found then
    raise exception 'Customer profile not found';
  end if;

  return jsonb_build_object(
    'success', true,
    'already_applied', false,
    'penalty_applied', v_amount
  );
end;
$$;

-- Customer files one dispute per unpaid no-show penalty.
create or replace function public.submit_penalty_dispute(
  p_booking_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'Dispute reason must be between 10 and 1000 characters';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id is distinct from auth.uid() then raise exception 'Not authorized'; end if;
  if v_booking.status <> 'no_show'::public.booking_status or v_booking.penalty_fee <= 0 then
    raise exception 'Booking has no disputable no-show penalty';
  end if;
  if v_booking.penalty_paid then raise exception 'Paid penalties cannot be disputed'; end if;
  if v_booking.dispute_status <> 'none' then raise exception 'Dispute already submitted or resolved'; end if;

  update public.bookings
  set dispute_status = 'pending',
      dispute_reason = v_reason,
      dispute_resolved_at = null,
      dispute_resolved_by = null,
      updated_at = now()
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'dispute_status', 'pending');
end;
$$;

-- Returns both ledger balance and the amount collectible now. Pending disputes
-- remain in the ledger but are paused until the admin resolves them.
create or replace function public.get_my_penalty_balance()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'outstanding_balance', coalesce(u.outstanding_penalty_balance, 0),
    'pending_disputes', coalesce((
      select sum(b.penalty_fee)
      from public.bookings b
      where b.customer_id = auth.uid()
        and b.penalty_paid = false
        and b.dispute_status = 'pending'
    ), 0),
    'collectible_balance', greatest(
      coalesce(u.outstanding_penalty_balance, 0) - coalesce((
        select sum(b.penalty_fee)
        from public.bookings b
        where b.customer_id = auth.uid()
          and b.penalty_paid = false
          and b.dispute_status = 'pending'
      ), 0),
      0
    )
  )
  from public.users u
  where u.id = auth.uid()
$$;

-- Cash settlement. The collecting booking must already be done and managed by
-- the caller. One collection per booking makes retries idempotent.
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
  v_user public.users%rowtype;
  v_pending_disputes numeric(10, 2);
  v_collectible numeric(10, 2);
  v_amount numeric(10, 2) := round(coalesce(p_paid_amount, 0)::numeric, 2);
  v_existing public.penalty_collections%rowtype;
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

  select * into v_user from public.users where id = p_user_id for update;
  if not found then raise exception 'Customer profile not found'; end if;

  select coalesce(sum(penalty_fee), 0) into v_pending_disputes
  from public.bookings
  where customer_id = p_user_id
    and penalty_paid = false
    and dispute_status = 'pending';

  v_collectible := greatest(v_user.outstanding_penalty_balance - v_pending_disputes, 0);
  if v_collectible <= 0 then
    return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', 0);
  end if;
  -- Passing 0 means "collect the full eligible cash balance". This lets the
  -- merchant complete a booking without being granted read access to customer
  -- financial fields.
  if v_amount = 0 then
    v_amount := v_collectible;
  end if;
  if v_amount <> v_collectible then
    raise exception 'Paid amount must equal collectible balance of % EGP', v_collectible;
  end if;

  update public.users
  set outstanding_penalty_balance = greatest(outstanding_penalty_balance - v_amount, 0),
      pending_penalty_fee_egp = greatest(pending_penalty_fee_egp - v_amount, 0),
      updated_at = now()
  where id = p_user_id;

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

  return jsonb_build_object('success', true, 'already_applied', false, 'paid_amount', v_amount);
end;
$$;

-- Admin resolution. p_admin_id is accepted for API compatibility but must be
-- the authenticated admin; callers cannot attribute decisions to another user.
create or replace function public.resolve_penalty_dispute(
  p_booking_id uuid,
  p_action text,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_admin uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_waived numeric(10, 2) := 0;
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  if p_admin_id is not null and p_admin_id <> v_admin then raise exception 'Admin identity mismatch'; end if;
  if v_action not in ('waive', 'reject') then raise exception 'Action must be waive or reject'; end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;
  if v_booking.dispute_status <> 'pending' then raise exception 'Dispute is not pending'; end if;
  if v_booking.penalty_paid then raise exception 'Paid penalty cannot be resolved without a refund workflow'; end if;

  if v_action = 'waive' then
    v_waived := v_booking.penalty_fee;
    update public.users
    set outstanding_penalty_balance = greatest(outstanding_penalty_balance - v_waived, 0),
        pending_penalty_fee_egp = greatest(pending_penalty_fee_egp - v_waived, 0),
        updated_at = now()
    where id = v_booking.customer_id;

    update public.bookings
    set dispute_status = 'waived',
        penalty_fee = 0,
        penalty_paid = false,
        dispute_resolved_at = now(),
        dispute_resolved_by = v_admin,
        updated_at = now()
    where id = p_booking_id;
  else
    update public.bookings
    set dispute_status = 'rejected',
        dispute_resolved_at = now(),
        dispute_resolved_by = v_admin,
        updated_at = now()
    where id = p_booking_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'waived_amount', v_waived
  );
end;
$$;

create or replace function public.list_pending_penalty_disputes()
returns table (
  booking_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  shop_id text,
  shop_name text,
  branch_name text,
  service_name text,
  scheduled_at timestamptz,
  penalty_fee numeric,
  dispute_reason text,
  dispute_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  return query
  select
    b.id,
    b.customer_id,
    coalesce(u.full_name, b.customer_name, 'Customer'),
    coalesce(u.phone, b.customer_phone, ''),
    b.shop_id,
    s.name,
    coalesce(sb.name, s.name),
    coalesce(b.service_name, b.service_name_ar, b.shop_type::text),
    b.scheduled_at,
    b.penalty_fee,
    coalesce(b.dispute_reason, ''),
    b.updated_at
  from public.bookings b
  left join public.users u on u.id = b.customer_id
  join public.shops s on s.id = b.shop_id
  left join public.shop_branches sb on sb.id = b.branch_id
  where b.dispute_status = 'pending'
  order by b.updated_at asc;
end;
$$;

-- Keep late-cancellation penalties in the canonical balance.
create or replace function public.cancel_customer_service_booking(p_booking_id uuid)
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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id is distinct from auth.uid() then raise exception 'Not authorized to cancel this booking'; end if;
  if v_booking.status in ('cancelled'::public.booking_status, 'done'::public.booking_status, 'no_show'::public.booking_status) then
    raise exception 'Booking cannot be cancelled in status: %', v_booking.status;
  end if;

  v_hours_before := extract(epoch from (v_booking.scheduled_at - now())) / 3600.0;
  if v_booking.shop_type in ('wash'::public.shop_type, 'maintenance'::public.shop_type)
     and v_hours_before < 4 then
    v_penalty := 20;
    update public.users
    set outstanding_penalty_balance = outstanding_penalty_balance + v_penalty,
        pending_penalty_fee_egp = pending_penalty_fee_egp + v_penalty,
        updated_at = now()
    where id = auth.uid();
  end if;

  update public.bookings
  set status = 'cancelled'::public.booking_status,
      cancellation_penalty_applied_egp = v_penalty,
      late_cancelled_at = case when v_penalty > 0 then now() else null end,
      updated_at = now()
  where id = p_booking_id;

  return jsonb_build_object('success', true, 'penalty_applied', v_penalty, 'hours_before', round(v_hours_before::numeric, 2));
end;
$$;

-- Existing admin settlement now also closes PitStop penalty receivables.
create or replace function public.admin_settle_shop_platform_fees(p_shop_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Not authorized'; end if;
  update public.shops
  set platform_fee_last_settled_at = now(), updated_at = now()
  where id = p_shop_id and is_active = true;
  if not found then raise exception 'Active shop not found'; end if;

  update public.penalty_collections
  set platform_settled_at = now()
  where collecting_shop_id = p_shop_id and platform_settled_at is null;
end;
$$;

revoke all on function public.mark_booking_no_show(uuid, numeric) from public;
revoke all on function public.submit_penalty_dispute(uuid, text) from public;
revoke all on function public.get_my_penalty_balance() from public;
revoke all on function public.apply_penalty_payment(uuid, numeric, uuid) from public;
revoke all on function public.resolve_penalty_dispute(uuid, text, uuid) from public;
revoke all on function public.list_pending_penalty_disputes() from public;

grant execute on function public.mark_booking_no_show(uuid, numeric) to authenticated;
grant execute on function public.submit_penalty_dispute(uuid, text) to authenticated;
grant execute on function public.get_my_penalty_balance() to authenticated;
grant execute on function public.apply_penalty_payment(uuid, numeric, uuid) to authenticated;
grant execute on function public.resolve_penalty_dispute(uuid, text, uuid) to authenticated;
grant execute on function public.list_pending_penalty_disputes() to authenticated;
grant execute on function public.cancel_customer_service_booking(uuid) to authenticated;
grant execute on function public.admin_settle_shop_platform_fees(text) to authenticated;

-- Direct profile updates must never be able to forge financial balances. Calls
-- made from the SECURITY DEFINER RPCs execute as the function owner and pass.
create or replace function public.protect_penalty_balance_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (
       new.outstanding_penalty_balance is distinct from old.outstanding_penalty_balance
       or new.pending_penalty_fee_egp is distinct from old.pending_penalty_fee_egp
     ) then
    raise exception 'Penalty balances can only be changed through approved RPCs';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_penalty_balance_columns_trigger on public.users;
create trigger protect_penalty_balance_columns_trigger
before update of outstanding_penalty_balance, pending_penalty_fee_egp
on public.users
for each row execute function public.protect_penalty_balance_columns();

-- Supabase may carry explicit anon EXECUTE grants from default privileges.
revoke execute on function public.mark_booking_no_show(uuid, numeric) from anon;
revoke execute on function public.submit_penalty_dispute(uuid, text) from anon;
revoke execute on function public.get_my_penalty_balance() from anon;
revoke execute on function public.apply_penalty_payment(uuid, numeric, uuid) from anon;
revoke execute on function public.resolve_penalty_dispute(uuid, text, uuid) from anon;
revoke execute on function public.list_pending_penalty_disputes() from anon;
revoke execute on function public.cancel_customer_service_booking(uuid) from public, anon;
revoke execute on function public.admin_settle_shop_platform_fees(text) from public, anon;
revoke execute on function public.protect_penalty_balance_columns() from public, anon, authenticated;
