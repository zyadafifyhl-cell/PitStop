-- POS/ERP accounting columns, receivables ledger, and shop_pos_analytics RPC.

alter table public.pos_orders
  add column if not exists payment_status text not null default 'paid',
  add column if not exists payment_method text not null default 'cash',
  add column if not exists subtotal numeric(12, 2) not null default 0,
  add column if not exists tax numeric(12, 2) not null default 0,
  add column if not exists total_amount numeric(12, 2) not null default 0;

update public.pos_orders
set
  subtotal = case when coalesce(subtotal, 0) = 0 then coalesce(price, 0) else subtotal end,
  total_amount = case when coalesce(total_amount, 0) = 0 then coalesce(price, 0) else total_amount end
where coalesce(subtotal, 0) = 0 or coalesce(total_amount, 0) = 0;

alter table public.pos_orders drop constraint if exists pos_orders_payment_status_check;
alter table public.pos_orders
  add constraint pos_orders_payment_status_check
  check (payment_status in ('paid', 'unpaid'));

alter table public.pos_orders drop constraint if exists pos_orders_payment_method_check;
alter table public.pos_orders
  add constraint pos_orders_payment_method_check
  check (payment_method in ('cash', 'instapay', 'credit'));

alter table public.shop_expenses add column if not exists title text;
alter table public.shop_expenses add column if not exists created_at timestamptz default now();

update public.shop_expenses
set
  title = coalesce(nullif(title, ''), item_name),
  created_at = coalesce(created_at, recorded_at, now());

alter table public.shop_expenses drop constraint if exists shop_expenses_category_check;
alter table public.shop_expenses
  add constraint shop_expenses_category_check
  check (category in (
    'raw_materials', 'utilities', 'labor_advance', 'staff_advance', 'staff_wage',
    'tea_food', 'maintenance', 'other'
  ));

create table if not exists public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  agency_name text,
  amount_due numeric(12, 2) not null check (amount_due >= 0),
  status text not null default 'pending' check (status in ('pending', 'settled')),
  created_at timestamptz not null default now()
);

create index if not exists customer_credits_shop_status_idx
  on public.customer_credits (shop_id, status, created_at desc);

alter table public.customer_credits enable row level security;
drop policy if exists customer_credits_select on public.customer_credits;
drop policy if exists customer_credits_write on public.customer_credits;
create policy customer_credits_select on public.customer_credits
  for select using (public.can_manage_shop(shop_id) or public.is_platform_admin());
create policy customer_credits_write on public.customer_credits
  for all using (public.can_manage_shop(shop_id) or public.is_platform_admin())
  with check (public.can_manage_shop(shop_id) or public.is_platform_admin());
grant select, insert, update, delete on public.customer_credits to authenticated;

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
  p_booking_id uuid default null,
  p_payment_method text default 'cash',
  p_payment_status text default 'paid'
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
  v_method text := coalesce(nullif(trim(p_payment_method), ''), 'cash');
  v_pay_status text := coalesce(nullif(trim(p_payment_status), ''), 'paid');
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_method not in ('cash', 'instapay', 'credit') then
    v_method := 'cash';
  end if;
  if v_pay_status not in ('paid', 'unpaid') then
    v_pay_status := case when v_method = 'credit' then 'unpaid' else 'paid' end;
  end if;
  if v_method = 'credit' then
    v_pay_status := 'unpaid';
  end if;

  v_shift_id := public.pos_ensure_open_shift(p_shop_id, 0);
  v_customer_id := public.pos_upsert_customer(
    p_shop_id, p_phone, p_full_name, p_license_plate, p_car_type, p_notes, true
  );

  insert into public.pos_orders (
    shop_id, shift_id, customer_id, booking_id, source, service_id, car_type,
    price, assigned_employee_id, pitstop_commission, status,
    payment_status, payment_method, subtotal, tax, total_amount
  ) values (
    p_shop_id, v_shift_id, v_customer_id, p_booking_id, 'walk_in', p_service_id,
    coalesce(nullif(trim(p_car_type), ''), 'sedan'),
    coalesce(p_price, 0),
    p_employee_id,
    0,
    'completed',
    v_pay_status,
    v_method,
    coalesce(p_price, 0),
    0,
    coalesce(p_price, 0)
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

  update public.pos_orders
  set
    subtotal = coalesce(p_price, 0) + v_accessories,
    total_amount = coalesce(p_price, 0) + v_accessories
  where id = v_order_id;

  if v_pay_status = 'unpaid' and v_customer_id is not null then
    insert into public.customer_credits (shop_id, customer_id, agency_name, amount_due, status)
    values (p_shop_id, v_customer_id, coalesce(nullif(trim(p_full_name), ''), p_phone), coalesce(p_price, 0) + v_accessories, 'pending');
  end if;

  if v_pay_status = 'paid' then
    update public.pos_shifts
    set system_cash_expected = system_cash_expected + coalesce(p_price, 0) + v_accessories
    where id = v_shift_id;
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.pos_create_walk_in_order(text, uuid, numeric, text, text, text, text, uuid, text, jsonb, uuid, text, text) to authenticated;

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
  v_category text := coalesce(nullif(trim(p_category), ''), 'other');
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_category = 'labor_advance' then
    v_category := 'staff_advance';
  end if;

  select id into v_shift
  from public.pos_shifts
  where shop_id = p_shop_id and status = 'open'
  order by opened_at desc
  limit 1;

  insert into public.shop_expenses (shop_id, shift_id, category, item_name, title, amount, notes)
  values (p_shop_id, v_shift, v_category, trim(p_item_name), trim(p_item_name), coalesce(p_amount, 0), nullif(trim(p_notes), ''))
  returning id into v_id;

  if p_deduct_cash and v_shift is not null then
    update public.pos_shifts
    set system_cash_expected = system_cash_expected - coalesce(p_amount, 0)
    where id = v_shift;
  end if;

  return v_id;
end;
$$;

create or replace function public.shop_pos_analytics(
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
  v_wash numeric := 0;
  v_accessories numeric := 0;
  v_materials numeric := 0;
  v_operating numeric := 0;
  v_payroll numeric := 0;
  v_commissions numeric := 0;
  v_fees numeric := 0;
  v_fees_due numeric := 0;
  v_unpaid numeric := 0;
  v_credits numeric := 0;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select coalesce(sum(coalesce(nullif(total_amount, 0), price)), 0) into v_walk_in
  from public.pos_orders
  where shop_id = p_shop_id
    and source = 'walk_in'
    and status = 'completed'
    and created_at >= p_from and created_at < p_to;

  select coalesce(sum(coalesce(nullif(total_amount, 0), price)), 0) into v_app
  from public.pos_orders
  where shop_id = p_shop_id
    and source = 'pitstop_app'
    and status = 'completed'
    and created_at >= p_from and created_at < p_to;

  v_app := v_app + coalesce((
    select sum(coalesce(final_amount_paid_egp, service_price_egp, total_price, 0))
    from public.bookings
    where shop_id = p_shop_id
      and booking_type = 'app'
      and status in ('done', 'confirmed', 'in_progress')
      and scheduled_at >= p_from and scheduled_at < p_to
      and (id is null or id not in (
        select booking_id from public.pos_orders
        where shop_id = p_shop_id and booking_id is not null
      ))
  ), 0);

  v_wash := coalesce((
    select sum(coalesce(price, 0))
    from public.pos_orders
    where shop_id = p_shop_id
      and status = 'completed'
      and created_at >= p_from and created_at < p_to
  ), 0);

  v_wash := v_wash + coalesce((
    select sum(coalesce(final_amount_paid_egp, service_price_egp, total_price, 0))
    from public.bookings
    where shop_id = p_shop_id
      and booking_type = 'app'
      and status in ('done', 'confirmed', 'in_progress')
      and scheduled_at >= p_from and scheduled_at < p_to
      and (id is null or id not in (
        select booking_id from public.pos_orders
        where shop_id = p_shop_id and booking_id is not null
      ))
  ), 0);

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
    and coalesce(created_at, recorded_at) >= p_from
    and coalesce(created_at, recorded_at) < p_to;

  select coalesce(sum(amount), 0) into v_operating
  from public.shop_expenses
  where shop_id = p_shop_id
    and category in ('utilities', 'tea_food', 'maintenance', 'other')
    and coalesce(created_at, recorded_at) >= p_from
    and coalesce(created_at, recorded_at) < p_to;

  select coalesce(sum(amount), 0) into v_payroll
  from public.shop_expenses
  where shop_id = p_shop_id
    and category in ('staff_advance', 'staff_wage', 'labor_advance')
    and coalesce(created_at, recorded_at) >= p_from
    and coalesce(created_at, recorded_at) < p_to;

  v_payroll := v_payroll + coalesce((
    select sum(amount) from public.employee_payroll_records
    where shop_id = p_shop_id
      and type in ('daily_wage', 'monthly_salary', 'commission')
      and date >= p_from::date and date < p_to::date
  ), 0);

  v_commissions := coalesce((
    select sum(amount) from public.employee_payroll_records
    where shop_id = p_shop_id
      and type = 'commission'
      and date >= p_from::date and date < p_to::date
  ), 0);

  v_commissions := v_commissions + coalesce((
    select sum(coalesce(nullif(o.total_amount, 0), o.price) * coalesce(e.commission_rate, 0) / 100.0)
    from public.pos_orders o
    join public.branch_employees e on e.id = o.assigned_employee_id
    where o.shop_id = p_shop_id
      and o.status = 'completed'
      and o.created_at >= p_from and o.created_at < p_to
      and coalesce(e.commission_rate, 0) > 0
  ), 0);

  v_payroll := v_payroll + coalesce((
    select sum(coalesce(nullif(o.total_amount, 0), o.price) * coalesce(e.commission_rate, 0) / 100.0)
    from public.pos_orders o
    join public.branch_employees e on e.id = o.assigned_employee_id
    where o.shop_id = p_shop_id
      and o.status = 'completed'
      and o.created_at >= p_from and o.created_at < p_to
      and coalesce(e.commission_rate, 0) > 0
  ), 0);

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

  select coalesce(sum(pitstop_commission), 0) into v_fees_due
  from public.pos_orders
  where shop_id = p_shop_id
    and status = 'completed'
    and commission_settled = false
    and pitstop_commission > 0;

  v_fees_due := v_fees_due + coalesce((
    select sum(b.platform_fee_egp)
    from public.bookings b
    join public.shops s on s.id = b.shop_id
    where b.shop_id = p_shop_id
      and b.booking_type = 'app'
      and b.status in ('done', 'confirmed', 'in_progress')
      and b.scheduled_at > coalesce(s.platform_fee_last_settled_at, '1970-01-01'::timestamptz)
  ), 0);

  select coalesce(sum(coalesce(nullif(total_amount, 0), price)), 0) into v_unpaid
  from public.pos_orders
  where shop_id = p_shop_id
    and status = 'completed'
    and payment_status = 'unpaid';

  select coalesce(sum(amount_due), 0) into v_credits
  from public.customer_credits
  where shop_id = p_shop_id
    and status = 'pending';

  return jsonb_build_object(
    'totalSales', v_walk_in + v_app,
    'walkInSales', v_walk_in,
    'appBookingSales', v_app,
    'washRevenue', v_wash,
    'accessorySales', v_accessories,
    'operatingExpenses', v_materials + v_operating,
    'rawMaterials', v_materials,
    'operations', v_operating,
    'payroll', v_payroll,
    'employeeCommissions', v_commissions,
    'pitstopFees', v_fees,
    'pitstopFeesDue', v_fees_due,
    'uncollected', v_unpaid + v_credits,
    'unpaidOrders', v_unpaid,
    'pendingCredits', v_credits,
    'netProfit', (v_walk_in + v_app) - (v_materials + v_operating) - v_payroll - v_fees
  );
end;
$$;

grant execute on function public.shop_pos_analytics(text, timestamptz, timestamptz) to authenticated;
