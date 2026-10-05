-- App bookings carry the customer's profile name and feed the shop's CRM (public.customers),
-- so a returning customer can be found by phone at the POS even without the app.

create or replace function public.bookings_fill_customer_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if nullif(trim(coalesce(new.customer_name, '')), '') is null and new.customer_id is not null then
    select nullif(trim(u.full_name), '') into new.customer_name
    from public.users u
    where u.id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_fill_customer_name on public.bookings;
create trigger bookings_fill_customer_name
  before insert or update of customer_id, customer_name on public.bookings
  for each row execute function public.bookings_fill_customer_name();

create or replace function public.bookings_sync_shop_customer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_phone text;
  v_name text;
  v_completed boolean;
begin
  -- Walk-ins are written to the CRM by pos_create_walk_in_order.
  if new.booking_type = 'walk_in' then
    return new;
  end if;

  v_phone := public.pos_normalize_phone(new.customer_phone);
  if v_phone is null then
    return new;
  end if;

  v_name := coalesce(nullif(trim(new.customer_name), ''), '');
  v_completed := new.status = 'done'
    and (tg_op = 'INSERT' or old.status is distinct from 'done');

  insert into public.customers (shop_id, phone, full_name, car_type, total_visits, last_visit_at)
  values (
    new.shop_id,
    v_phone,
    v_name,
    'sedan',
    case when v_completed then 1 else 0 end,
    case when v_completed then now() else null end
  )
  on conflict (shop_id, phone) do update
  set
    full_name = case
      when nullif(trim(public.customers.full_name), '') is null then excluded.full_name
      else public.customers.full_name
    end,
    total_visits = public.customers.total_visits + case when v_completed then 1 else 0 end,
    last_visit_at = case when v_completed then now() else public.customers.last_visit_at end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists bookings_sync_shop_customer on public.bookings;
create trigger bookings_sync_shop_customer
  after insert or update of status, customer_name, customer_phone on public.bookings
  for each row execute function public.bookings_sync_shop_customer();

-- Backfill the CRM from existing app bookings (before names are backfilled, so the
-- status trigger does not create rows with zero visits first).
with app_customers as (
  select
    b.shop_id,
    public.pos_normalize_phone(b.customer_phone) as phone,
    max(coalesce(nullif(trim(b.customer_name), ''), nullif(trim(u.full_name), ''))) as full_name,
    count(*) filter (where b.status = 'done') as visits,
    max(b.scheduled_at) filter (where b.status = 'done') as last_visit
  from public.bookings b
  left join public.users u on u.id = b.customer_id
  where b.booking_type is distinct from 'walk_in'
    and public.pos_normalize_phone(b.customer_phone) is not null
  group by b.shop_id, public.pos_normalize_phone(b.customer_phone)
)
insert into public.customers (shop_id, phone, full_name, car_type, total_visits, last_visit_at)
select shop_id, phone, coalesce(full_name, ''), 'sedan', visits, last_visit
from app_customers
on conflict (shop_id, phone) do update
set
  full_name = case
    when nullif(trim(public.customers.full_name), '') is null then excluded.full_name
    else public.customers.full_name
  end,
  updated_at = now();

-- Backfill names on existing bookings.
update public.bookings b
set customer_name = nullif(trim(u.full_name), '')
from public.users u
where u.id = b.customer_id
  and nullif(trim(coalesce(b.customer_name, '')), '') is null
  and nullif(trim(u.full_name), '') is not null;
