-- One bay must not be sold twice when two customers confirm the same slot together.
-- The capacity trigger already locks the branch row, but it ran as the customer, so
-- row-level security hid every other booking and both inserts saw an empty slot.
-- This version runs as the function owner, waits on that branch lock for up to 60
-- seconds, then counts every occupying booking before allowing the insert.

create or replace function public.enforce_booking_bay_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bays integer;
  v_duration integer;
  v_slot_minutes integer;
  v_count integer;
  v_start timestamptz;
  v_end timestamptz;
begin
  if new.branch_id is null then
    return new;
  end if;

  if new.status in ('cancelled', 'no_show', 'suspended_by_shop', 'done') then
    return new;
  end if;

  -- The second confirm waits here until the first transaction commits or rolls back.
  -- 60s is only the ceiling; a normal booking releases the lock in well under a second.
  perform set_config('lock_timeout', '60s', true);

  begin
    select
      coalesce(total_bays, 3),
      coalesce(slot_duration_minutes, service_duration_minutes, 45)
    into v_bays, v_slot_minutes
    from public.shop_branches
    where id = new.branch_id
    for update;
  exception
    when lock_not_available then
      raise exception 'SLOT_FULL'
        using errcode = 'P0001';
  end;

  if v_bays is null then
    return new;
  end if;

  v_duration := greatest(5, coalesce(new.service_duration_minutes, v_slot_minutes));
  v_start := new.scheduled_at;
  v_end := new.scheduled_at + make_interval(mins => v_duration);

  begin
    perform 1
    from public.bookings b
    where b.branch_id = new.branch_id
      and b.status in ('pending', 'confirmed', 'in_progress')
      and (tg_op = 'INSERT' or b.id <> new.id)
      and public.booking_occupies_window(
        b.scheduled_at,
        coalesce(b.service_duration_minutes, v_slot_minutes),
        v_start,
        v_end
      )
    for update of b;
  exception
    when lock_not_available then
      raise exception 'SLOT_FULL'
        using errcode = 'P0001';
  end;

  select count(*)::int
  into v_count
  from public.bookings b
  where b.branch_id = new.branch_id
    and b.status in ('pending', 'confirmed', 'in_progress')
    and (tg_op = 'INSERT' or b.id <> new.id)
    and public.booking_occupies_window(
      b.scheduled_at,
      coalesce(b.service_duration_minutes, v_slot_minutes),
      v_start,
      v_end
    );

  if v_count >= v_bays then
    raise exception 'SLOT_FULL'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
