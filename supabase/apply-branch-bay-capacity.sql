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

create or replace function public.peak_bay_occupancy(
  p_branch_id uuid,
  p_start timestamptz,
  p_duration_minutes integer,
  p_exclude_booking_id uuid default null
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
  counts as (
    select (
      select count(*)::int
      from public.bookings b
      where b.branch_id = p_branch_id
        and b.status not in ('cancelled', 'no_show', 'suspended_by_shop', 'done')
        and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
        and b.scheduled_at < blocks.block_start + interval '30 minutes'
        and b.scheduled_at + make_interval(mins => greatest(coalesce(b.service_duration_minutes, 30), 1))
            > blocks.block_start
    ) as occupied
    from blocks
  )
  select coalesce(max(occupied), 0)::int from counts;
$$;

drop function if exists public.check_slot_availability(uuid, timestamptz);

create or replace function public.check_slot_availability(
  p_branch_id uuid,
  p_target_time timestamptz,
  p_duration_minutes integer default 30
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
  select coalesce(total_bays, 3)
  into v_bays
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

  v_duration := greatest(coalesce(p_duration_minutes, 30), 1);
  v_count := public.peak_bay_occupancy(p_branch_id, p_target_time, v_duration, null);
  v_remaining := greatest(v_bays - v_count, 0);

  return jsonb_build_object(
    'is_available', v_remaining > 0,
    'remaining_bays', v_remaining,
    'total_bays', v_bays,
    'occupied_bays', least(v_count, v_bays)
  );
end;
$$;

revoke all on function public.peak_bay_occupancy(uuid, timestamptz, integer, uuid) from public;
grant execute on function public.peak_bay_occupancy(uuid, timestamptz, integer, uuid) to anon, authenticated;
revoke all on function public.check_slot_availability(uuid, timestamptz, integer) from public;
grant execute on function public.check_slot_availability(uuid, timestamptz, integer) to anon, authenticated;

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

  v_duration := greatest(coalesce(new.service_duration_minutes, 30), 1);
  v_count := public.peak_bay_occupancy(
    new.branch_id,
    new.scheduled_at,
    v_duration,
    case when tg_op = 'UPDATE' then new.id else null end
  );

  if v_count >= v_bays then
    raise exception 'SLOT_FULL'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_booking_bay_capacity on public.bookings;
create trigger trg_enforce_booking_bay_capacity
  before insert or update of scheduled_at, status, branch_id, service_duration_minutes
  on public.bookings
  for each row
  execute function public.enforce_booking_bay_capacity();
