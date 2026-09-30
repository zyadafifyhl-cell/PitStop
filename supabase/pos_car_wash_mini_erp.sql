-- PitStop Merchant POS & Mini-ERP
-- Shifts, shop CRM customers, unified POS orders, expenses, payroll.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.pos_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_trim text := nullif(trim(p_phone), '');
begin
  if v_trim is null then
    return null;
  end if;
  if v_trim like '+20%' then
    return '0' || substring(v_trim from 4);
  end if;
  if v_trim like '20%' and length(v_trim) >= 11 then
    return '0' || substring(v_trim from 3);
  end if;
  return v_trim;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee pay rates
-- ---------------------------------------------------------------------------

alter table public.branch_employees
  add column if not exists daily_wage numeric(12, 2) not null default 0,
  add column if not exists commission_rate numeric(8, 4) not null default 0,
  add column if not exists monthly_salary numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Inventory kind: retail accessories vs raw materials / supplies
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists inventory_kind text not null default 'retail';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_inventory_kind_check'
  ) then
    alter table public.products
      add constraint products_inventory_kind_check
      check (inventory_kind in ('retail', 'supply'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. pos_shifts
-- ---------------------------------------------------------------------------

create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid references public.users(id) on delete set null,
  closed_by uuid references public.users(id) on delete set null,
  opening_cash_float numeric(12, 2) not null default 0,
  system_cash_expected numeric(12, 2) not null default 0,
  actual_cash_counted numeric(12, 2),
  cash_difference numeric(12, 2) generated always as (
    coalesce(actual_cash_counted, 0) - coalesce(system_cash_expected, 0)
  ) stored,
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists pos_shifts_one_open_per_shop
  on public.pos_shifts (shop_id)
  where status = 'open';

create index if not exists pos_shifts_shop_opened_idx
  on public.pos_shifts (shop_id, opened_at desc);

-- ---------------------------------------------------------------------------
-- 2. customers (shop CRM — distinct from app auth users)
-- ---------------------------------------------------------------------------

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  phone text not null,
  full_name text not null default '',
  license_plate text,
  car_type text not null default 'sedan'
    check (car_type in ('sedan', 'suv', 'truck', 'hatchback', 'coupe', 'van', 'other')),
  total_visits integer not null default 0,
  last_visit_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, phone)
);

create index if not exists customers_shop_phone_idx on public.customers (shop_id, phone);
create index if not exists customers_shop_plate_idx on public.customers (shop_id, license_plate);

-- ---------------------------------------------------------------------------
-- 3. pos_orders
-- ---------------------------------------------------------------------------

create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  source text not null check (source in ('walk_in', 'pitstop_app')),
  service_id uuid references public.branch_services(id) on delete set null,
  car_type text,
  price numeric(12, 2) not null default 0,
  assigned_employee_id uuid references public.branch_employees(id) on delete set null,
  pitstop_commission numeric(12, 2) not null default 0,
  commission_settled boolean not null default false,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists pos_orders_shop_created_idx on public.pos_orders (shop_id, created_at desc);
create index if not exists pos_orders_shift_idx on public.pos_orders (shift_id);
create index if not exists pos_orders_customer_idx on public.pos_orders (customer_id);

-- ---------------------------------------------------------------------------
-- 4. pos_order_items
-- ---------------------------------------------------------------------------

create table if not exists public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pos_order_items_order_idx on public.pos_order_items (order_id);

-- ---------------------------------------------------------------------------
-- 5. shop_expenses
-- ---------------------------------------------------------------------------

create table if not exists public.shop_expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  category text not null check (
    category in ('raw_materials', 'utilities', 'labor_advance', 'tea_food', 'maintenance', 'other')
  ),
  item_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  recorded_at timestamptz not null default now(),
  notes text
);

create index if not exists shop_expenses_shop_recorded_idx on public.shop_expenses (shop_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- 6. employee_payroll_records
-- ---------------------------------------------------------------------------

create table if not exists public.employee_payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.branch_employees(id) on delete cascade,
  shop_id text not null references public.shops(id) on delete cascade,
  type text not null check (type in ('daily_wage', 'commission', 'advance_deduction', 'monthly_salary')),
  amount numeric(12, 2) not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists employee_payroll_shop_date_idx
  on public.employee_payroll_records (shop_id, date desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pos_shifts enable row level security;
alter table public.customers enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.shop_expenses enable row level security;
alter table public.employee_payroll_records enable row level security;

drop policy if exists pos_shifts_select on public.pos_shifts;
drop policy if exists pos_shifts_write on public.pos_shifts;
create policy pos_shifts_select on public.pos_shifts
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy pos_shifts_write on public.pos_shifts
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

drop policy if exists customers_select on public.customers;
drop policy if exists customers_write on public.customers;
create policy customers_select on public.customers
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy customers_write on public.customers
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

drop policy if exists pos_orders_select on public.pos_orders;
drop policy if exists pos_orders_write on public.pos_orders;
create policy pos_orders_select on public.pos_orders
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy pos_orders_write on public.pos_orders
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

drop policy if exists pos_order_items_select on public.pos_order_items;
drop policy if exists pos_order_items_write on public.pos_order_items;
create policy pos_order_items_select on public.pos_order_items
  for select using (
    exists (
      select 1 from public.pos_orders o
      where o.id = order_id
        and (public.can_manage_shop(o.shop_id) or public.is_platform_admin())
    )
  );
create policy pos_order_items_write on public.pos_order_items
  for all using (
    exists (
      select 1 from public.pos_orders o
      where o.id = order_id
        and (public.can_manage_shop(o.shop_id) or public.is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.pos_orders o
      where o.id = order_id
        and (public.can_manage_shop(o.shop_id) or public.is_platform_admin())
    )
  );

drop policy if exists shop_expenses_select on public.shop_expenses;
drop policy if exists shop_expenses_write on public.shop_expenses;
create policy shop_expenses_select on public.shop_expenses
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy shop_expenses_write on public.shop_expenses
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

drop policy if exists employee_payroll_select on public.employee_payroll_records;
drop policy if exists employee_payroll_write on public.employee_payroll_records;
create policy employee_payroll_select on public.employee_payroll_records
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy employee_payroll_write on public.employee_payroll_records
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());

grant select, insert, update, delete on public.pos_shifts to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.pos_orders to authenticated;
grant select, insert, update, delete on public.pos_order_items to authenticated;
grant select, insert, update, delete on public.shop_expenses to authenticated;
grant select, insert, update, delete on public.employee_payroll_records to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.pos_ensure_open_shift(
  p_shop_id text,
  p_opening_float numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select id into v_shift_id
  from public.pos_shifts
  where shop_id = p_shop_id and status = 'open'
  order by opened_at desc
  limit 1;

  if v_shift_id is not null then
    return v_shift_id;
  end if;

  insert into public.pos_shifts (
    shop_id, opened_by, opening_cash_float, system_cash_expected, status
  ) values (
    p_shop_id,
    auth.uid(),
    coalesce(p_opening_float, 0),
    coalesce(p_opening_float, 0),
    'open'
  )
  returning id into v_shift_id;

  return v_shift_id;
end;
$$;

create or replace function public.pos_upsert_customer(
  p_shop_id text,
  p_phone text,
  p_full_name text default '',
  p_license_plate text default null,
  p_car_type text default 'sedan',
  p_notes text default null,
  p_increment_visit boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.pos_normalize_phone(p_phone);
  v_id uuid;
  v_car text := coalesce(nullif(trim(p_car_type), ''), 'sedan');
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_phone is null then
    return null;
  end if;
  if v_car not in ('sedan', 'suv', 'truck', 'hatchback', 'coupe', 'van', 'other') then
    v_car := 'other';
  end if;

  select id into v_id
  from public.customers
  where shop_id = p_shop_id and phone = v_phone
  limit 1;

  if v_id is null then
    insert into public.customers (
      shop_id, phone, full_name, license_plate, car_type, notes,
      total_visits, last_visit_at
    ) values (
      p_shop_id,
      v_phone,
      coalesce(nullif(trim(p_full_name), ''), ''),
      nullif(trim(p_license_plate), ''),
      v_car,
      nullif(trim(p_notes), ''),
      case when p_increment_visit then 1 else 0 end,
      case when p_increment_visit then now() else null end
    )
    returning id into v_id;
  else
    update public.customers
    set
      full_name = case when nullif(trim(p_full_name), '') is null then full_name else trim(p_full_name) end,
      license_plate = coalesce(nullif(trim(p_license_plate), ''), license_plate),
      car_type = v_car,
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      total_visits = total_visits + case when p_increment_visit then 1 else 0 end,
      last_visit_at = case when p_increment_visit then now() else last_visit_at end,
      updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.pos_create_walk_in_order(
  p_shop_id text,
  p_service_id uuid,
  p_price numeric,
  p_car_type text,
  p_phone text default null,
  p_full_name text default '',
  p_license_plate text default null,
  p_employee_id uuid default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_booking_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_unit numeric;
  v_subtotal numeric;
  v_stock integer;
  v_accessories numeric := 0;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_shift_id := public.pos_ensure_open_shift(p_shop_id, 0);
  v_customer_id := public.pos_upsert_customer(
    p_shop_id, p_phone, p_full_name, p_license_plate, p_car_type, p_notes, true
  );

  insert into public.pos_orders (
    shop_id, shift_id, customer_id, booking_id, source, service_id, car_type,
    price, assigned_employee_id, pitstop_commission, status
  ) values (
    p_shop_id, v_shift_id, v_customer_id, p_booking_id, 'walk_in', p_service_id,
    coalesce(nullif(trim(p_car_type), ''), 'sedan'),
    coalesce(p_price, 0),
    p_employee_id,
    0,
    'completed'
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    v_unit := coalesce((v_item->>'unit_price')::numeric, 0);
    v_subtotal := round(v_unit * v_qty, 2);

    if v_product_id is not null then
      select stock_quantity into v_stock
      from public.products
      where id = v_product_id and shop_id = p_shop_id
      for update;

      if v_stock is null then
        raise exception 'product not found';
      end if;
      if v_stock < v_qty then
        raise exception 'insufficient stock';
      end if;

      update public.products
      set
        stock_quantity = stock_quantity - v_qty,
        stock = coalesce(stock, stock_quantity) - v_qty,
        updated_at = now()
      where id = v_product_id;
    end if;

    insert into public.pos_order_items (order_id, product_id, quantity, unit_price, subtotal)
    values (v_order_id, v_product_id, v_qty, v_unit, v_subtotal);

    v_accessories := v_accessories + v_subtotal;
  end loop;

  update public.pos_shifts
  set system_cash_expected = system_cash_expected + coalesce(p_price, 0) + v_accessories
  where id = v_shift_id;

  return v_order_id;
end;
$$;

create or replace function public.pos_close_shift(
  p_shift_id uuid,
  p_actual_cash numeric
)
returns public.pos_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop text;
  v_row public.pos_shifts;
begin
  select shop_id into v_shop from public.pos_shifts where id = p_shift_id;
  if v_shop is null then
    raise exception 'shift not found';
  end if;
  if not public.can_manage_shop(v_shop) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.pos_shifts
  set
    actual_cash_counted = coalesce(p_actual_cash, 0),
    closed_at = now(),
    closed_by = auth.uid(),
    status = 'closed'
  where id = p_shift_id and status = 'open'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'shift is not open';
  end if;
  return v_row;
end;
$$;

create or replace function public.pos_log_expense(
  p_shop_id text,
  p_category text,
  p_item_name text,
  p_amount numeric,
  p_notes text default null,
  p_deduct_cash boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift uuid;
  v_id uuid;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select id into v_shift
  from public.pos_shifts
  where shop_id = p_shop_id and status = 'open'
  order by opened_at desc
  limit 1;

  insert into public.shop_expenses (shop_id, shift_id, category, item_name, amount, notes)
  values (p_shop_id, v_shift, p_category, trim(p_item_name), coalesce(p_amount, 0), nullif(trim(p_notes), ''))
  returning id into v_id;

  if p_deduct_cash and v_shift is not null then
    update public.pos_shifts
    set system_cash_expected = system_cash_expected - coalesce(p_amount, 0)
    where id = v_shift;
  end if;

  return v_id;
end;
$$;

create or replace function public.shop_pos_financials(
  p_shop_id text,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_walk_in numeric := 0;
  v_app numeric := 0;
  v_accessories numeric := 0;
  v_materials numeric := 0;
  v_operating numeric := 0;
  v_payroll numeric := 0;
  v_fees numeric := 0;
  v_fees_unsettled numeric := 0;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(price), 0) into v_walk_in
  from public.pos_orders
  where shop_id = p_shop_id
    and source = 'walk_in'
    and status = 'completed'
    and created_at >= p_from and created_at < p_to;

  select coalesce(sum(coalesce(final_amount_paid_egp, service_price_egp)), 0) into v_app
  from public.bookings
  where shop_id = p_shop_id
    and booking_type = 'app'
    and status in ('done', 'confirmed', 'in_progress')
    and scheduled_at >= p_from and scheduled_at < p_to;

  select coalesce(sum(i.subtotal), 0) into v_accessories
  from public.pos_order_items i
  join public.pos_orders o on o.id = i.order_id
  where o.shop_id = p_shop_id
    and o.status = 'completed'
    and o.created_at >= p_from and o.created_at < p_to;

  select coalesce(sum(amount), 0) into v_materials
  from public.shop_expenses
  where shop_id = p_shop_id
    and category = 'raw_materials'
    and recorded_at >= p_from and recorded_at < p_to;

  select coalesce(sum(amount), 0) into v_operating
  from public.shop_expenses
  where shop_id = p_shop_id
    and category in ('utilities', 'tea_food', 'maintenance', 'other')
    and recorded_at >= p_from and recorded_at < p_to;

  select coalesce(sum(amount), 0) into v_payroll
  from public.employee_payroll_records
  where shop_id = p_shop_id
    and date >= p_from::date and date < p_to::date;

  -- labor_advance shop_expenses are cash-drawer mirrors of advance_deduction payroll rows.

  select coalesce(sum(platform_fee_egp), 0) into v_fees
  from public.bookings
  where shop_id = p_shop_id
    and booking_type = 'app'
    and status in ('done', 'confirmed', 'in_progress')
    and scheduled_at >= p_from and scheduled_at < p_to;

  v_fees := v_fees + coalesce((
    select sum(pitstop_commission) from public.pos_orders
    where shop_id = p_shop_id
      and status = 'completed'
      and created_at >= p_from and created_at < p_to
  ), 0);

  select coalesce(sum(pitstop_commission), 0) into v_fees_unsettled
  from public.pos_orders
  where shop_id = p_shop_id
    and status = 'completed'
    and commission_settled = false
    and pitstop_commission > 0;

  v_fees_unsettled := v_fees_unsettled + coalesce((
    select sum(platform_fee_egp) from public.bookings b
    join public.shops s on s.id = b.shop_id
    where b.shop_id = p_shop_id
      and b.booking_type = 'app'
      and b.status in ('done', 'confirmed', 'in_progress')
      and b.scheduled_at > s.platform_fee_last_settled_at
  ), 0);

  return jsonb_build_object(
    'walkInRevenue', v_walk_in,
    'appBookingRevenue', v_app,
    'accessorySales', v_accessories,
    'rawMaterialPurchases', v_materials,
    'operatingExpenses', v_operating,
    'payrollAndAdvances', v_payroll,
    'pitstopCommissions', v_fees,
    'pitstopFeesDue', v_fees_unsettled,
    'netProfit', (v_walk_in + v_app + v_accessories) - (v_materials + v_operating + v_payroll + v_fees)
  );
end;
$$;

grant execute on function public.pos_normalize_phone(text) to authenticated;
grant execute on function public.pos_ensure_open_shift(text, numeric) to authenticated;
grant execute on function public.pos_upsert_customer(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.pos_create_walk_in_order(text, uuid, numeric, text, text, text, text, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.pos_close_shift(uuid, numeric) to authenticated;
grant execute on function public.pos_log_expense(text, text, text, numeric, text, boolean) to authenticated;
grant execute on function public.shop_pos_financials(text, timestamptz, timestamptz) to authenticated;
