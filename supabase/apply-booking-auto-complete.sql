-- One-click service lifecycle + auto-complete fallback timer.

do $$ begin
  create type public.booking_completion_type as enum ('manual', 'auto');
exception when duplicate_object then null;
end $$;

alter table public.bookings
  add column if not exists started_at timestamptz;

alter table public.bookings
  add column if not exists expected_completion_at timestamptz;

alter table public.bookings
  add column if not exists completed_at timestamptz;

alter table public.bookings
  add column if not exists completion_type public.booking_completion_type;

alter table public.bookings
  add column if not exists service_duration_minutes integer;

create index if not exists bookings_auto_complete_due_idx
  on public.bookings (expected_completion_at)
  where status = 'in_progress' and expected_completion_at is not null;

create or replace function public.booking_service_duration_minutes(p_booking public.bookings)
returns integer
language sql
stable
set search_path = public
as $$
  select greatest(
    5,
    coalesce(
      p_booking.service_duration_minutes,
      (select s.duration_minutes from public.branch_services s where s.id = p_booking.service_id),
      (select b.slot_duration_minutes from public.shop_branches b where b.id = p_booking.branch_id),
      45
    )
  );
$$;

create or replace function public.notify_booking_ready(p_booking public.bookings)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
  v_shop_name_ar text;
begin
  if p_booking.customer_id is null then
    return;
  end if;

  select name, name_ar
  into v_shop_name, v_shop_name_ar
  from public.shops
  where id = p_booking.shop_id;

  insert into public.customer_in_app_notifications (
    customer_id, kind, title, message, message_ar
  ) values (
    p_booking.customer_id::text,
    'booking_ready',
    coalesce(v_shop_name, 'PitStop'),
    'Your car is ready for pickup at ' || coalesce(v_shop_name, 'the shop') || '!',
    'عربيتك جاهزة للاستلام من ' || coalesce(nullif(v_shop_name_ar, ''), v_shop_name, 'المحل') || '!'
  );
end;
$$;

create or replace function public.start_booking_service(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_duration integer;
  v_started timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if not public.can_manage_shop(v_booking.shop_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_booking.status = 'in_progress' then
    if v_booking.started_at is null or v_booking.expected_completion_at is null then
      v_duration := public.booking_service_duration_minutes(v_booking);
      v_started := coalesce(v_booking.started_at, now());
      update public.bookings
      set
        started_at = v_started,
        expected_completion_at = coalesce(
          v_booking.expected_completion_at,
          v_started + make_interval(mins => v_duration + 15)
        ),
        service_duration_minutes = coalesce(service_duration_minutes, v_duration),
        updated_at = now()
      where id = p_booking_id
      returning * into v_booking;
    end if;
    return to_jsonb(v_booking);
  end if;

  if v_booking.status not in ('confirmed', 'pending') then
    raise exception 'BOOKING_NOT_STARTABLE';
  end if;

  v_duration := public.booking_service_duration_minutes(v_booking);
  v_started := now();

  update public.bookings
  set
    status = 'in_progress',
    started_at = v_started,
    expected_completion_at = v_started + make_interval(mins => v_duration + 15),
    service_duration_minutes = coalesce(service_duration_minutes, v_duration),
    updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return to_jsonb(v_booking);
end;
$$;

create or replace function public.complete_booking_service(
  p_booking_id uuid,
  p_completion_type public.booking_completion_type default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  if not public.can_manage_shop(v_booking.shop_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_booking.status = 'done' then
    return to_jsonb(v_booking);
  end if;

  if v_booking.status not in ('in_progress', 'confirmed') then
    raise exception 'BOOKING_NOT_COMPLETABLE';
  end if;

  update public.bookings
  set
    status = 'done',
    completed_at = coalesce(completed_at, now()),
    completion_type = coalesce(completion_type, p_completion_type),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform public.notify_booking_ready(v_booking);
  return to_jsonb(v_booking);
end;
$$;

create or replace function public.auto_complete_due_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bookings%rowtype;
  v_ids uuid[] := '{}';
  v_count integer := 0;
begin
  for v_row in
    select *
    from public.bookings
    where status = 'in_progress'
      and expected_completion_at is not null
      and expected_completion_at <= now()
    for update skip locked
  loop
    update public.bookings
    set
      status = 'done',
      completed_at = now(),
      completion_type = 'auto',
      updated_at = now()
    where id = v_row.id
    returning * into v_row;

    perform public.notify_booking_ready(v_row);
    v_ids := array_append(v_ids, v_row.id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count, 'booking_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.start_booking_service(uuid) from public;
revoke all on function public.complete_booking_service(uuid, public.booking_completion_type) from public;
revoke all on function public.auto_complete_due_bookings() from public;
grant execute on function public.start_booking_service(uuid) to authenticated;
grant execute on function public.complete_booking_service(uuid, public.booking_completion_type) to authenticated;
grant execute on function public.auto_complete_due_bookings() to authenticated;
grant execute on function public.auto_complete_due_bookings() to service_role;

-- Fallback timer: complete overdue in-progress bookings every 5 minutes.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname = 'auto-complete-due-bookings';
exception
  when undefined_table then null;
  when undefined_function then null;
end $$;

do $$
begin
  perform cron.schedule(
    'auto-complete-due-bookings',
    '*/5 * * * *',
    'select public.auto_complete_due_bookings()'
  );
exception
  when undefined_function then null;
end $$;
