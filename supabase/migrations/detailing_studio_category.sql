-- Add Detailing & Protection Studio without invalidating existing legacy shop_type values.
-- shops.category is the public five-category taxonomy; shops.type remains the operational enum.

alter type public.shop_type add value if not exists 'detailing_studio';

alter table public.shops
  drop constraint if exists shops_category_check;

update public.shops
set category = case type::text
  when 'wash' then 'car_wash'
  when 'detailing_studio' then 'detailing_studio'
  when 'maintenance' then 'workshop'
  when 'parts' then 'parts_shop'
  when 'accessories' then 'parts_shop'
  when 'winch' then 'driver_network'
  else category
end
where category is null
   or category not in ('car_wash', 'detailing_studio', 'workshop', 'parts_shop', 'driver_network');

alter table public.shops
  add constraint shops_category_check
  check (category in ('car_wash', 'detailing_studio', 'workshop', 'parts_shop', 'driver_network'));

alter table public.branch_services
  add column if not exists warranty_period text,
  add column if not exists duration_unit text not null default 'hours';

alter table public.branch_services
  drop constraint if exists branch_services_duration_unit_check;

alter table public.branch_services
  add constraint branch_services_duration_unit_check
  check (duration_unit in ('minutes', 'hours', 'days'));

-- Existing duration_minutes values are minute-based. New detailing services opt into days.
update public.branch_services
set duration_unit = 'minutes'
where duration_unit = 'hours';

alter table public.pos_orders
  add column if not exists deposit_paid numeric not null default 0,
  add column if not exists remaining_balance numeric not null default 0,
  add column if not exists car_chassis_number text,
  add column if not exists estimated_delivery_date timestamptz,
  add column if not exists workflow_stage text not null default 'ready_for_delivery';

alter table public.pos_orders
  drop constraint if exists pos_orders_deposit_paid_check,
  drop constraint if exists pos_orders_remaining_balance_check,
  drop constraint if exists pos_orders_workflow_stage_check;

alter table public.pos_orders
  add constraint pos_orders_deposit_paid_check check (deposit_paid >= 0),
  add constraint pos_orders_remaining_balance_check check (remaining_balance >= 0),
  add constraint pos_orders_workflow_stage_check
    check (workflow_stage in ('in_progress', 'curing_inspection', 'ready_for_delivery'));

create or replace function public.sync_shop_standard_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.category := case new.type::text
    when 'wash' then 'car_wash'
    when 'detailing_studio' then 'detailing_studio'
    when 'maintenance' then 'workshop'
    when 'parts' then 'parts_shop'
    when 'accessories' then 'parts_shop'
    when 'winch' then 'driver_network'
    else new.category
  end;
  return new;
end;
$$;

drop trigger if exists shops_sync_standard_category on public.shops;
create trigger shops_sync_standard_category
before insert or update of type on public.shops
for each row execute function public.sync_shop_standard_category();

create or replace function public.register_shop_owner(
  p_shop_name text,
  p_shop_name_ar text,
  p_shop_type public.shop_type,
  p_area_id text,
  p_address text,
  p_address_ar text,
  p_phone text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_shop_id text;
  v_branch_id uuid;
  v_area_exists boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email = '' then raise exception 'User email required'; end if;
  if nullif(trim(p_shop_name), '') is null then raise exception 'Shop name is required'; end if;

  select exists(select 1 from public.areas where id = p_area_id) into v_area_exists;
  if not v_area_exists then raise exception 'Invalid area'; end if;

  if exists (
    select 1 from public.users u
    where u.id = v_uid
      and u.role in ('owner'::public.user_role, 'pending_owner'::public.user_role, 'admin'::public.user_role)
  ) then
    raise exception 'Account already registered as merchant or admin';
  end if;

  v_shop_id := 'shop-' || p_shop_type::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.shops (
    id, name, name_ar, type, area_id, address, address_ar, phone,
    latitude, longitude, owner_email, owner_user_id, is_active
  ) values (
    v_shop_id, trim(p_shop_name),
    coalesce(nullif(trim(p_shop_name_ar), ''), trim(p_shop_name)),
    p_shop_type, p_area_id,
    coalesce(nullif(trim(p_address), ''), 'Address pending'),
    coalesce(nullif(trim(p_address_ar), ''), coalesce(nullif(trim(p_address), ''), 'Address pending')),
    coalesce(nullif(trim(p_phone), ''), ''),
    30.0, 31.0, v_email, v_uid, false
  );

  insert into public.shop_branches (
    shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
    is_default, sort_order, is_active
  ) values (
    v_shop_id, 'main', trim(p_shop_name),
    coalesce(nullif(trim(p_shop_name_ar), ''), trim(p_shop_name)),
    p_area_id,
    coalesce(nullif(trim(p_address), ''), 'Address pending'),
    coalesce(nullif(trim(p_address_ar), ''), coalesce(nullif(trim(p_address), ''), 'Address pending')),
    coalesce(nullif(trim(p_phone), ''), ''),
    true, 0, true
  )
  returning id into v_branch_id;

  if p_shop_type::text = 'detailing_studio' then
    insert into public.branch_services (
      shop_id, branch_id, name, name_ar, category, price_egp,
      duration_minutes, duration_unit, warranty_period, visible, sort_order
    ) values
      (v_shop_id, v_branch_id, 'Full Body PPF (Gloss / Matte)', 'حماية PPF كاملة (لامع / مط)', 'detailing', 0, 3, 'days', '5 Years', true, 0),
      (v_shop_id, v_branch_id, 'Front Clip PPF Protection', 'حماية PPF للواجهة الأمامية', 'detailing', 0, 2, 'days', '5 Years', true, 1),
      (v_shop_id, v_branch_id, 'Nano Ceramic 9H (1 Year Warranty)', 'نانو سيراميك 9H (ضمان سنة)', 'detailing', 0, 1, 'days', '1 Year', true, 2),
      (v_shop_id, v_branch_id, 'Nano Ceramic 9H (3 Years Warranty)', 'نانو سيراميك 9H (ضمان 3 سنوات)', 'detailing', 0, 2, 'days', '3 Years', true, 3),
      (v_shop_id, v_branch_id, 'Paint Correction & Multi-stage Polishing', 'تصحيح دهان وتلميع متعدد المراحل', 'detailing', 0, 2, 'days', null, true, 4),
      (v_shop_id, v_branch_id, 'Thermal Window Tinting', 'تظليل حراري للزجاج', 'detailing', 0, 1, 'days', '5 Years', true, 5),
      (v_shop_id, v_branch_id, 'Deep Interior Steam Clean & Leather Shield', 'تنظيف داخلي عميق بالبخار وحماية الجلد', 'interior_cleaning', 0, 1, 'days', null, true, 6);
  end if;

  update public.users
  set role = 'pending_owner'::public.user_role,
      shop_id = v_shop_id,
      is_active = false,
      updated_at = now()
  where id = v_uid;

  return v_shop_id;
end;
$$;

comment on column public.shops.category is
  'Five-category public taxonomy: car_wash, detailing_studio, workshop, parts_shop, driver_network.';
comment on column public.branch_services.warranty_period is
  'Optional customer-facing warranty label, for example 3 Years.';
comment on column public.branch_services.duration_unit is
  'Unit for the service duration value. Existing duration_minutes remains the numeric storage field.';
comment on column public.pos_orders.deposit_paid is
  'Cash collected as a down payment for a detailing order.';
comment on column public.pos_orders.remaining_balance is
  'Outstanding amount still receivable for the order.';

create or replace function public.store_orders_enforce_wash_pickup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.shops s
    where s.id = new.shop_id
      and s.type in ('wash', 'detailing_studio')
  ) then
    new.fulfillment_method := 'pickup';
    new.payment_method := 'pickup';
    new.delivery_fee := 0;
    new.total_price := coalesce(new.subtotal, 0);
    new.delivery_address := null;
  end if;
  return new;
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
  p_booking_id uuid default null,
  p_payment_method text default 'cash',
  p_payment_status text default 'paid',
  p_deposit_paid numeric default 0,
  p_remaining_balance numeric default 0,
  p_car_chassis_number text default null,
  p_estimated_delivery_date timestamptz default null,
  p_workflow_stage text default 'ready_for_delivery'
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
  v_deposit numeric := greatest(0, coalesce(p_deposit_paid, 0));
  v_remaining numeric := greatest(0, coalesce(p_remaining_balance, 0));
  v_total numeric := coalesce(p_price, 0);
  v_stage text := coalesce(nullif(trim(p_workflow_stage), ''), 'ready_for_delivery');
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_method not in ('cash', 'instapay', 'credit') then
    v_method := 'cash';
  end if;
  if v_stage not in ('in_progress', 'curing_inspection', 'ready_for_delivery') then
    v_stage := 'ready_for_delivery';
  end if;
  if v_pay_status not in ('paid', 'unpaid') then
    v_pay_status := case when v_method = 'credit' or v_remaining > 0 then 'unpaid' else 'paid' end;
  end if;
  if v_method = 'credit' or v_remaining > 0 then
    v_pay_status := 'unpaid';
  end if;

  v_shift_id := public.pos_ensure_open_shift(p_shop_id, 0);
  v_customer_id := public.pos_upsert_customer(
    p_shop_id, p_phone, p_full_name, p_license_plate, p_car_type, p_notes, true
  );

  insert into public.pos_orders (
    shop_id, shift_id, customer_id, booking_id, source, service_id, car_type,
    price, assigned_employee_id, pitstop_commission, status,
    payment_status, payment_method, subtotal, tax, total_amount,
    deposit_paid, remaining_balance, car_chassis_number, estimated_delivery_date, workflow_stage
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
    coalesce(p_price, 0),
    v_deposit,
    v_remaining,
    nullif(trim(p_car_chassis_number), ''),
    p_estimated_delivery_date,
    v_stage
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

  v_total := coalesce(p_price, 0) + v_accessories;
  if v_remaining <= 0 and v_deposit > 0 and v_deposit < v_total then
    v_remaining := v_total - v_deposit;
  end if;
  if v_remaining > 0 then
    v_pay_status := 'unpaid';
  end if;

  update public.pos_orders
  set
    subtotal = v_total,
    total_amount = v_total,
    remaining_balance = v_remaining,
    payment_status = v_pay_status
  where id = v_order_id;

  if v_pay_status = 'unpaid' and v_customer_id is not null and v_remaining > 0 then
    insert into public.customer_credits (shop_id, customer_id, agency_name, amount_due, status)
    values (p_shop_id, v_customer_id, coalesce(nullif(trim(p_full_name), ''), p_phone), v_remaining, 'pending');
  elsif v_pay_status = 'unpaid' and v_customer_id is not null then
    insert into public.customer_credits (shop_id, customer_id, agency_name, amount_due, status)
    values (p_shop_id, v_customer_id, coalesce(nullif(trim(p_full_name), ''), p_phone), v_total, 'pending');
  end if;

  if v_deposit > 0 then
    update public.pos_shifts
    set system_cash_expected = system_cash_expected + v_deposit
    where id = v_shift_id;
  elsif v_pay_status = 'paid' then
    update public.pos_shifts
    set system_cash_expected = system_cash_expected + v_total
    where id = v_shift_id;
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.pos_create_walk_in_order(text, uuid, numeric, text, text, text, text, uuid, text, jsonb, uuid, text, text, numeric, numeric, text, timestamptz, text) to authenticated;

create or replace function public.pos_update_order_workflow(
  p_order_id uuid,
  p_workflow_stage text,
  p_deposit_paid numeric default null,
  p_remaining_balance numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text;
  v_stage text := coalesce(nullif(trim(p_workflow_stage), ''), 'in_progress');
begin
  select shop_id into v_shop_id from public.pos_orders where id = p_order_id;
  if v_shop_id is null then
    raise exception 'order not found';
  end if;
  if not public.can_manage_shop(v_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;
  if v_stage not in ('in_progress', 'curing_inspection', 'ready_for_delivery') then
    raise exception 'invalid workflow stage';
  end if;

  update public.pos_orders
  set
    workflow_stage = v_stage,
    deposit_paid = coalesce(p_deposit_paid, deposit_paid),
    remaining_balance = coalesce(p_remaining_balance, remaining_balance),
    payment_status = case
      when coalesce(p_remaining_balance, remaining_balance, 0) > 0 then 'unpaid'
      else payment_status
    end
  where id = p_order_id;
end;
$$;

grant execute on function public.pos_update_order_workflow(uuid, text, numeric, numeric) to authenticated;

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
  v_remaining numeric := 0;
begin
  if not public.can_manage_shop(p_shop_id) and not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  -- Cash collected: deposits when a balance remains, otherwise paid totals.
  select coalesce(sum(
    case
      when coalesce(deposit_paid, 0) > 0 then deposit_paid
      when payment_status = 'paid' then coalesce(nullif(total_amount, 0), price)
      else 0
    end
  ), 0) into v_walk_in
  from public.pos_orders
  where shop_id = p_shop_id
    and source = 'walk_in'
    and status = 'completed'
    and created_at >= p_from and created_at < p_to;

  select coalesce(sum(
    case
      when coalesce(deposit_paid, 0) > 0 then deposit_paid
      when payment_status = 'paid' then coalesce(nullif(total_amount, 0), price)
      else 0
    end
  ), 0) into v_app
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

  v_wash := v_walk_in + v_app;

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

  select coalesce(sum(remaining_balance), 0) into v_remaining
  from public.pos_orders
  where shop_id = p_shop_id
    and status = 'completed'
    and remaining_balance > 0;

  select coalesce(sum(coalesce(nullif(total_amount, 0), price)), 0) into v_unpaid
  from public.pos_orders
  where shop_id = p_shop_id
    and status = 'completed'
    and payment_status = 'unpaid'
    and coalesce(remaining_balance, 0) = 0;

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
    'uncollected', v_remaining + v_unpaid + v_credits,
    'unpaidOrders', v_remaining + v_unpaid,
    'pendingCredits', v_credits,
    'netProfit', (v_walk_in + v_app) - (v_materials + v_operating) - v_payroll - v_fees
  );
end;
$$;

grant execute on function public.shop_pos_analytics(text, timestamptz, timestamptz) to authenticated;
