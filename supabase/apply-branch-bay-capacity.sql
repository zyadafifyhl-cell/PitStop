-- Dynamic branch bay/slot capacity for Shop Admin.
-- Concurrent working bays live on shop_branches; occupancy is counted on bookings.

alter table public.shop_branches
  add column if not exists total_bays integer not null default 3;

alter table public.shop_branches
  add column if not exists slot_duration_minutes integer not null default 30;

alter table public.shop_branches
  add column if not exists opening_time time not null default '09:00';

alter table public.shop_branches
  add column if not exists closing_time time not null default '22:00';

update public.shop_branches
set slot_duration_minutes = case
  when coalesce(service_duration_minutes, 30) <= 30 then 30
  when service_duration_minutes <= 45 then 45
  else 60
end;

alter table public.shop_branches
  drop constraint if exists shop_branches_total_bays_check;
alter table public.shop_branches
  add constraint shop_branches_total_bays_check
  check (total_bays >= 1 and total_bays <= 50);

alter table public.shop_branches
  drop constraint if exists shop_branches_slot_duration_check;
alter table public.shop_branches
  add constraint shop_branches_slot_duration_check
  check (slot_duration_minutes in (30, 45, 60));

alter table public.bookings
  add column if not exists car_plate text;

create index if not exists bookings_branch_slot_idx
  on public.bookings (branch_id, scheduled_at)
  where status not in ('cancelled', 'no_show', 'suspended_by_shop', 'done');

create or replace function public.check_slot_availability(
  p_branch_id uuid,
  p_target_time timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bays integer;
  v_duration integer;
  v_count integer;
  v_remaining integer;
begin
  select
    coalesce(total_bays, 3),
    coalesce(slot_duration_minutes, service_duration_minutes, 30)
  into v_bays, v_duration
  from public.shop_branches
  where id = p_branch_id
    and is_active = true;

  if v_bays is null then
    return jsonb_build_object(
      'is_available', false,
      'remaining_bays', 0,
      'total_bays', 0,
      'occupied_bays', 0
    );
  end if;

  select count(*)::int
  into v_count
  from public.bookings
  where branch_id = p_branch_id
    and status not in ('cancelled', 'no_show', 'suspended_by_shop', 'done')
    and scheduled_at >= p_target_time
    and scheduled_at < p_target_time + make_interval(mins => v_duration);

  v_remaining := greatest(v_bays - v_count, 0);

  return jsonb_build_object(
    'is_available', v_remaining > 0,
    'remaining_bays', v_remaining,
    'total_bays', v_bays,
    'occupied_bays', least(v_count, v_bays)
  );
end;
$$;

revoke all on function public.check_slot_availability(uuid, timestamptz) from public;
grant execute on function public.check_slot_availability(uuid, timestamptz) to anon, authenticated;

create or replace function public.enforce_booking_bay_capacity()
returns trigger
language plpgsql
as $$
declare
  v_bays integer;
  v_duration integer;
  v_count integer;
begin
  if new.branch_id is null then
    return new;
  end if;

  if new.status in ('cancelled', 'no_show', 'suspended_by_shop', 'done') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.branch_id::text),
    hashtext(date_trunc('minute', new.scheduled_at)::text)
  );

  select
    coalesce(total_bays, 3),
    coalesce(slot_duration_minutes, service_duration_minutes, 30)
  into v_bays, v_duration
  from public.shop_branches
  where id = new.branch_id;

  if v_bays is null then
    return new;
  end if;

  select count(*)::int
  into v_count
  from public.bookings
  where branch_id = new.branch_id
    and status not in ('cancelled', 'no_show', 'suspended_by_shop', 'done')
    and scheduled_at >= new.scheduled_at
    and scheduled_at < new.scheduled_at + make_interval(mins => v_duration)
    and (tg_op = 'INSERT' or id <> new.id);

  if v_count >= v_bays then
    raise exception 'SLOT_FULL'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_bay_capacity on public.bookings;
create trigger trg_enforce_booking_bay_capacity
  before insert or update of scheduled_at, status, branch_id
  on public.bookings
  for each row
  execute function public.enforce_booking_bay_capacity();
