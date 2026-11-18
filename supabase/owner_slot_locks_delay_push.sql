-- Owner slot locks, manual-only wash completion, delay updates, and customer Expo push.
--
-- 1. shop_slot_locks: an owner can close a 30-minute slot (all bays, or a number of bays)
--    so customers cannot book it. Walk-ins created by the shop still fit.
-- 2. Bookings never auto-complete. The owner presses Complete Wash.
-- 3. delay_booking_service: owner sends a 15/30/45/60 min delay with an optional reason.
--    It moves the estimate, writes an in-app notification, and sends an Expo push.
-- 4. customer_push_tokens + send_customer_push: push goes out from the database through
--    pg_net, so shop staff never read customer push tokens.

create extension if not exists pg_net with schema extensions;

-- ── Booking columns ──────────────────────────────────────────────────────────
alter table public.bookings add column if not exists delay_minutes integer not null default 0;
alter table public.bookings add column if not exists delay_reason text;
alter table public.bookings add column if not exists delayed_at timestamptz;
alter table public.bookings add column if not exists car_dropped_off boolean not null default false;

-- ── Slot locks ───────────────────────────────────────────────────────────────
create table if not exists public.shop_slot_locks (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.shop_branches(id) on delete cascade,
  slot_start timestamptz not null,
  blocked_bays integer check (blocked_bays is null or blocked_bays > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (branch_id, slot_start)
);

create index if not exists shop_slot_locks_branch_start_idx
  on public.shop_slot_locks (branch_id, slot_start);

alter table public.shop_slot_locks enable row level security;

drop policy if exists "Anyone can read slot locks" on public.shop_slot_locks;
create policy "Anyone can read slot locks" on public.shop_slot_locks
  for select to anon, authenticated using (true);

drop policy if exists "Shop staff insert slot locks" on public.shop_slot_locks;
create policy "Shop staff insert slot locks" on public.shop_slot_locks
  for insert to authenticated
  with check (
    public.can_manage_shop(shop_id)
    and exists (
      select 1 from public.shop_branches b
      where b.id = shop_slot_locks.branch_id and b.shop_id = shop_slot_locks.shop_id
    )
  );

drop policy if exists "Shop staff update slot locks" on public.shop_slot_locks;
create policy "Shop staff update slot locks" on public.shop_slot_locks
  for update to authenticated
  using (public.can_manage_shop(shop_id))
  with check (public.can_manage_shop(shop_id));

drop policy if exists "Shop staff delete slot locks" on public.shop_slot_locks;
create policy "Shop staff delete slot locks" on public.shop_slot_locks
  for delete to authenticated
  using (public.can_manage_shop(shop_id));

grant select on public.shop_slot_locks to anon, authenticated;
grant insert, update, delete on public.shop_slot_locks to authenticated;

-- Bookings plus shop-locked bays in the busiest 30-minute block of an appointment.
create or replace function public.peak_bay_load(
  p_branch_id uuid,
  p_start timestamptz,
  p_duration_minutes integer,
  p_exclude_booking_id uuid,
  p_total_bays integer,
  p_include_locks boolean
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with blocks as (
    select p_start + make_interval(mins => step) as block_start
    from generate_series(0, greatest(coalesce(p_duration_minutes, 30), 1) - 1, 30) as step
  ),
  loads as (
    select
      (
        select count(*)::int
        from public.bookings b
        where b.branch_id = p_branch_id
          and b.status not in ('cancelled', 'no_show', 'suspended_by_shop', 'done')
          and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
          and b.scheduled_at < blocks.block_start + interval '30 minutes'
          and b.scheduled_at + make_interval(mins => greatest(coalesce(b.service_duration_minutes, 30), 1))
              > blocks.block_start
      )
      + case when p_include_locks then coalesce((
          select sum(least(p_total_bays, coalesce(l.blocked_bays, p_total_bays)))::int
          from public.shop_slot_locks l
          where l.branch_id = p_branch_id
            and l.slot_start < blocks.block_start + interval '30 minutes'
            and l.slot_start + interval '30 minutes' > blocks.block_start
        ), 0) else 0 end
      as load
    from blocks
  )
  select coalesce(max(load), 0)::int from loads;
$$;

create or replace function public.enforce_booking_bay_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bays integer;
  v_duration integer;
  v_count integer;
  v_check_locks boolean;
begin
  if new.branch_id is null then
    return new;
  end if;

  if new.status in ('cancelled', 'no_show', 'suspended_by_shop', 'done') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('bay:' || new.branch_id::text));

  select coalesce(total_bays, 3)
  into v_bays
  from public.shop_branches
  where id = new.branch_id;

  if v_bays is null then
    return new;
  end if;

  -- Locks only stop new customer bookings. Accepting an existing request or a shop walk-in
  -- must still go through.
  v_check_locks :=
    coalesce(new.booking_type::text, 'app') <> 'walk_in'
    and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at);

  v_duration := greatest(coalesce(new.service_duration_minutes, 30), 1);
  v_count := public.peak_bay_load(
    new.branch_id,
    new.scheduled_at,
    v_duration,
    case when tg_op = 'UPDATE' then new.id else null end,
    v_bays,
    v_check_locks
  );

  if v_count >= v_bays then
    raise exception 'SLOT_FULL'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── Customer push tokens ─────────────────────────────────────────────────────
create table if not exists public.customer_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  expo_push_token text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  platform text,
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

alter table public.customer_push_tokens enable row level security;

drop policy if exists "Users manage own push tokens" on public.customer_push_tokens;
create policy "Users manage own push tokens" on public.customer_push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.customer_push_tokens to authenticated;

create or replace function public.send_customer_push(
  p_customer_id uuid,
  p_title_en text,
  p_body_en text,
  p_title_ar text,
  p_body_ar text,
  p_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_messages jsonb;
  v_count integer;
begin
  if p_customer_id is null then
    return 0;
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'to', t.expo_push_token,
      'sound', 'default',
      'priority', 'high',
      'title', case when t.locale = 'ar' then coalesce(p_title_ar, p_title_en) else p_title_en end,
      'body', case when t.locale = 'ar' then coalesce(p_body_ar, p_body_en) else p_body_en end,
      'data', coalesce(p_data, '{}'::jsonb)
    )), '[]'::jsonb),
    count(*)::int
  into v_messages, v_count
  from public.customer_push_tokens t
  where t.user_id = p_customer_id;

  if v_count = 0 then
    return 0;
  end if;

  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  exception when others then
    return 0;
  end;

  return v_count;
end;
$$;

revoke all on function public.send_customer_push(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ── Car ready: in-app row + push ─────────────────────────────────────────────
create or replace function public.notify_booking_ready(p_booking public.bookings)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_name text;
  v_shop_name_ar text;
  v_en text;
  v_ar text;
begin
  if p_booking.customer_id is null then
    return;
  end if;

  select name, name_ar
  into v_shop_name, v_shop_name_ar
  from public.shops
  where id = p_booking.shop_id;

  v_en := 'Your car is ready for pickup at ' || coalesce(v_shop_name, 'the shop') || '!';
  v_ar := 'عربيتك جاهزة للاستلام من ' || coalesce(nullif(v_shop_name_ar, ''), v_shop_name, 'المحل') || '!';

  insert into public.customer_in_app_notifications (customer_id, kind, title, message, message_ar)
  values (p_booking.customer_id::text, 'booking_ready', coalesce(v_shop_name, 'PitStop'), v_en, v_ar);

  perform public.send_customer_push(
    p_booking.customer_id,
    'Car ready',
    v_en,
    'العربية جاهزة',
    v_ar,
    jsonb_build_object('type', 'booking_ready', 'bookingId', p_booking.id, 'shopId', p_booking.shop_id)
  );
end;
$$;

-- ── No more blind auto-complete ──────────────────────────────────────────────
create or replace function public.auto_complete_due_bookings()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('count', 0, 'booking_ids', '[]'::jsonb);
$$;

do $$
begin
  perform cron.unschedule(j.jobid)
  from cron.job j
  where j.jobname = 'auto-complete-due-bookings';
exception
  when undefined_table then null;
  when undefined_function then null;
end $$;

-- ── Car left at the station ──────────────────────────────────────────────────
create or replace function public.set_booking_car_dropped_off(p_booking_id uuid, p_dropped boolean)
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

  update public.bookings
  set car_dropped_off = coalesce(p_dropped, false), updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return to_jsonb(v_booking);
end;
$$;

-- ── Delay update ─────────────────────────────────────────────────────────────
create or replace function public.delay_booking_service(
  p_booking_id uuid,
  p_delay_minutes integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_shop_name text;
  v_shop_name_ar text;
  v_duration integer;
  v_estimate timestamptz;
  v_time_en text;
  v_time_ar text;
  v_reason_en text;
  v_reason_ar text;
  v_en text;
  v_ar text;
begin
  if p_delay_minutes is null or p_delay_minutes < 5 or p_delay_minutes > 240 then
    raise exception 'INVALID_DELAY';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if not public.can_manage_shop(v_booking.shop_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'BOOKING_NOT_DELAYABLE';
  end if;

  v_duration := public.booking_service_duration_minutes(v_booking);

  if v_booking.status = 'in_progress' then
    v_estimate := greatest(
      coalesce(v_booking.expected_completion_at, coalesce(v_booking.started_at, now()) + make_interval(mins => v_duration)),
      now()
    ) + make_interval(mins => p_delay_minutes);
  else
    v_estimate := greatest(
      v_booking.scheduled_at + make_interval(mins => coalesce(v_booking.delay_minutes, 0)),
      now()
    ) + make_interval(mins => p_delay_minutes);
  end if;

  update public.bookings
  set
    delay_minutes = coalesce(delay_minutes, 0) + p_delay_minutes,
    delay_reason = nullif(trim(coalesce(p_reason, '')), ''),
    delayed_at = now(),
    expected_completion_at = case when status = 'in_progress' then v_estimate else expected_completion_at end,
    updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  select name, name_ar into v_shop_name, v_shop_name_ar from public.shops where id = v_booking.shop_id;
  v_shop_name := coalesce(v_shop_name, 'the shop');
  v_shop_name_ar := coalesce(nullif(v_shop_name_ar, ''), v_shop_name);

  v_time_en := to_char(v_estimate at time zone 'Africa/Cairo', 'FMHH12:MI AM');
  v_time_ar := replace(replace(v_time_en, 'AM', 'ص'), 'PM', 'م');

  v_reason_en := case v_booking.delay_reason
    when 'traffic' then 'High station traffic'
    when 'detailing' then 'Extra detailing needed'
    when 'previous_car' then 'Previous car delayed'
    else null end;
  v_reason_ar := case v_booking.delay_reason
    when 'traffic' then 'زحمة في المحطة'
    when 'detailing' then 'محتاجة تنظيف زيادة'
    when 'previous_car' then 'العربية اللي قبلك اتأخرت'
    else null end;

  if v_booking.status = 'in_progress' then
    v_en := 'Your car at ' || v_shop_name || ' needs about ' || p_delay_minutes
      || ' more min. New estimated ready time: ' || v_time_en || '.';
    v_ar := 'عربيتك في ' || v_shop_name_ar || ' محتاجة حوالي ' || p_delay_minutes
      || ' دقيقة زيادة. الوقت المتوقع للاستلام: ' || v_time_ar || '.';
  else
    v_en := 'Your appointment at ' || v_shop_name || ' is delayed by ' || p_delay_minutes
      || ' min. New estimated start: ' || v_time_en || '.';
    v_ar := 'ميعادك في ' || v_shop_name_ar || ' اتأخر ' || p_delay_minutes
      || ' دقيقة. الوقت المتوقع للبدء: ' || v_time_ar || '.';
  end if;

  if v_reason_en is not null then
    v_en := v_en || ' Reason: ' || v_reason_en || '.';
    v_ar := v_ar || ' السبب: ' || v_reason_ar || '.';
  end if;

  if v_booking.customer_id is not null then
    insert into public.customer_in_app_notifications (customer_id, kind, title, message, message_ar)
    values (v_booking.customer_id::text, 'booking_delayed', v_shop_name, v_en, v_ar);

    perform public.send_customer_push(
      v_booking.customer_id,
      'Booking delayed ' || p_delay_minutes || ' min',
      v_en,
      'تأخير ' || p_delay_minutes || ' دقيقة',
      v_ar,
      jsonb_build_object(
        'type', 'booking_delayed',
        'bookingId', v_booking.id,
        'shopId', v_booking.shop_id,
        'estimate', v_estimate
      )
    );
  end if;

  return to_jsonb(v_booking) || jsonb_build_object('estimated_at', v_estimate);
end;
$$;

revoke all on function public.set_booking_car_dropped_off(uuid, boolean) from public, anon;
revoke all on function public.delay_booking_service(uuid, integer, text) from public, anon;
grant execute on function public.set_booking_car_dropped_off(uuid, boolean) to authenticated;
grant execute on function public.delay_booking_service(uuid, integer, text) to authenticated;
