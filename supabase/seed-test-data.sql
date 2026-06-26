-- =============================================================================
-- PitStop 2.0 — TEST DATA (run after step1 + step2 migration)
-- Safe to re-run (idempotent). Password for demo Auth users: demo123
--
-- BEFORE running section 4: create Auth user in Dashboard → Authentication:
--   manager.wash@demo.com / demo123
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extra branch (multi-branch demo for Nile Auto Wash)
-- ---------------------------------------------------------------------------

insert into public.shop_branches (
  shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
  latitude, longitude, profile_name, profile_name_ar,
  service_price_egp, service_duration_minutes, shop_status, is_default, sort_order
)
values (
  'shop-wash-nile',
  'maadi-2',
  'Nile Auto Wash — Maadi 2',
  'مغسلة النيل — المعادي 2',
  'maadi',
  'Street 218, Maadi',
  'شارع 218، المعادي',
  '+201022334456',
  29.9580,
  31.2540,
  'Nile Auto Wash Maadi 2',
  'مغسلة النيل المعادي 2',
  250,
  45,
  'open',
  false,
  1
)
on conflict (shop_id, slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  address = excluded.address,
  address_ar = excluded.address_ar,
  service_price_egp = excluded.service_price_egp,
  updated_at = now();

-- Update main branch with sample wash settings
update public.shop_branches
set
  service_price_egp = 220,
  service_duration_minutes = 60,
  weekly_hours = '[
    {"day":1,"closed":false,"openTime":"09:00","closeTime":"22:00"},
    {"day":2,"closed":false,"openTime":"09:00","closeTime":"22:00"},
    {"day":3,"closed":false,"openTime":"09:00","closeTime":"22:00"},
    {"day":4,"closed":false,"openTime":"09:00","closeTime":"22:00"},
    {"day":5,"closed":false,"openTime":"09:00","closeTime":"23:00"},
    {"day":6,"closed":false,"openTime":"10:00","closeTime":"23:00"},
    {"day":0,"closed":true,"openTime":"09:00","closeTime":"18:00"}
  ]'::jsonb,
  shop_status = 'open',
  updated_at = now()
where shop_id = 'shop-wash-nile' and slug = 'main';

-- ---------------------------------------------------------------------------
-- 2) Branch services (Nile main branch)
-- ---------------------------------------------------------------------------

insert into public.branch_services (
  shop_id, branch_id, name, name_ar, category, price_egp, duration_minutes, visible, sort_order
)
select
  b.shop_id,
  b.id,
  v.name,
  v.name_ar,
  v.category,
  v.price_egp,
  v.duration_minutes,
  true,
  v.sort_order
from public.shop_branches b
cross join (
  values
    ('Exterior Wash', 'غسيل خارجي', 'exterior_wash', 150::numeric, 30, 1),
    ('Interior + Exterior', 'غسيل داخلي وخارجي', 'full_wash', 220::numeric, 45, 2),
    ('Premium Detail', 'تفصيل premium', 'detailing', 450::numeric, 90, 3),
    ('Engine Wash', 'غسيل موتور', 'engine_wash', 180::numeric, 25, 4)
) as v(name, name_ar, category, price_egp, duration_minutes, sort_order)
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.branch_services s
    where s.branch_id = b.id and s.name = v.name
  );

-- ---------------------------------------------------------------------------
-- 3) Branch employees (no login)
-- ---------------------------------------------------------------------------

insert into public.branch_employees (shop_id, branch_id, full_name, phone, job_title, notes)
select
  b.shop_id,
  b.id,
  v.full_name,
  v.phone,
  v.job_title,
  v.notes
from public.shop_branches b
cross join (
  values
    ('Ahmed Salah', '+201012345678', 'Washer', 'Morning shift'),
    ('Karim Nabil', '+201098765432', 'Supervisor', 'Branch floor lead'),
    ('Mohamed Fathy', '+201055123456', 'Washer', 'Evening shift')
) as v(full_name, phone, job_title, notes)
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.branch_employees e
    where e.branch_id = b.id and e.full_name = v.full_name
  );

insert into public.branch_employees (shop_id, branch_id, full_name, phone, job_title)
select
  b.shop_id,
  b.id,
  'Hassan Ali',
  '+201066111222',
  'Washer'
from public.shop_branches b
where b.shop_id = 'shop-wash-nile' and b.slug = 'maadi-2'
  and not exists (
    select 1 from public.branch_employees e
    where e.branch_id = b.id and e.full_name = 'Hassan Ali'
  );

-- ---------------------------------------------------------------------------
-- 4) Link owners (requires Auth users wash@demo.com etc.)
-- ---------------------------------------------------------------------------

insert into public.users (id, email, full_name, role, shop_id)
select
  au.id,
  lower(au.email),
  s.name,
  'owner'::public.user_role,
  s.id
from public.shops s
join auth.users au on lower(au.email) = lower(s.owner_email)
on conflict (id) do update set
  role = 'owner'::public.user_role,
  shop_id = excluded.shop_id,
  email = excluded.email,
  updated_at = now();

update public.shops s
set owner_user_id = u.id
from public.users u
where u.shop_id = s.id
  and u.role = 'owner'::public.user_role
  and s.owner_user_id is distinct from u.id;

-- Branch manager — create Auth user manager.wash@demo.com first, then:
insert into public.users (id, email, full_name, role, shop_id, branch_id)
select
  au.id,
  lower(au.email),
  'Maadi Branch Manager',
  'branch_manager'::public.user_role,
  'shop-wash-nile',
  b.id
from auth.users au
cross join public.shop_branches b
where lower(au.email) = 'manager.wash@demo.com'
  and b.shop_id = 'shop-wash-nile'
  and b.slug = 'main'
on conflict (id) do update set
  role = 'branch_manager'::public.user_role,
  shop_id = excluded.shop_id,
  branch_id = excluded.branch_id,
  full_name = excluded.full_name,
  updated_at = now();

update public.shop_branches b
set manager_user_id = u.id, updated_at = now()
from public.users u
where u.email = 'manager.wash@demo.com'
  and u.role = 'branch_manager'::public.user_role
  and b.id = u.branch_id
  and b.manager_user_id is distinct from u.id;

-- ---------------------------------------------------------------------------
-- 5) Sample bookings (for owner hub / customer my bookings testing)
-- ---------------------------------------------------------------------------

insert into public.bookings (
  shop_id,
  branch_id,
  shop_type,
  customer_phone,
  customer_name,
  car_type,
  car_color,
  service_name,
  service_name_ar,
  service_price_egp,
  platform_fee_egp,
  scheduled_at,
  status
)
select
  'shop-wash-nile',
  b.id,
  'wash'::public.shop_type,
  '+201102999010',
  'Test Customer',
  'Hyundai Elantra',
  'White',
  'Interior + Exterior',
  'غسيل داخلي وخارجي',
  220,
  26.40,
  now() + interval '1 day',
  'pending'::public.booking_status
from public.shop_branches b
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.bookings bk
    where bk.customer_phone = '+201102999010'
      and bk.status = 'pending'::public.booking_status
      and bk.shop_id = 'shop-wash-nile'
  );

insert into public.bookings (
  shop_id, branch_id, shop_type, customer_phone, customer_name,
  car_type, car_color, service_name, service_price_egp, platform_fee_egp,
  scheduled_at, status
)
select
  'shop-wash-nile',
  b.id,
  'wash'::public.shop_type,
  '+201102999010',
  'Test Customer',
  'Toyota Corolla',
  'Silver',
  'Exterior Wash',
  150,
  18,
  now() - interval '2 days',
  'done'::public.booking_status
from public.shop_branches b
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.bookings bk
    where bk.customer_phone = '+201102999010'
      and bk.car_type = 'Toyota Corolla'
      and bk.status = 'done'::public.booking_status
  );

insert into public.bookings (
  shop_id, branch_id, shop_type, customer_phone, customer_name,
  car_type, car_color, service_name, service_price_egp, platform_fee_egp,
  scheduled_at, status
)
select
  'shop-wash-nile',
  b.id,
  'wash'::public.shop_type,
  '+201102999010',
  'Test Customer',
  'Kia Sportage',
  'Black',
  'Premium Detail',
  450,
  54,
  now() - interval '5 days',
  'cancelled'::public.booking_status
from public.shop_branches b
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.bookings bk
    where bk.customer_phone = '+201102999010'
      and bk.car_type = 'Kia Sportage'
      and bk.status = 'cancelled'::public.booking_status
  );

insert into public.bookings (
  shop_id, branch_id, shop_type, customer_phone, customer_name,
  car_type, car_color, service_name, service_price_egp, platform_fee_egp,
  scheduled_at, status
)
select
  'shop-wash-nile',
  b.id,
  'wash'::public.shop_type,
  '+201102999010',
  'Test Customer',
  'BMW 320i',
  'Blue',
  'Interior + Exterior',
  220,
  26.40,
  now() + interval '2 hours',
  'confirmed'::public.booking_status
from public.shop_branches b
where b.shop_id = 'shop-wash-nile' and b.slug = 'main'
  and not exists (
    select 1 from public.bookings bk
    where bk.customer_phone = '+201102999010'
      and bk.car_type = 'BMW 320i'
      and bk.status = 'confirmed'::public.booking_status
  );

-- ---------------------------------------------------------------------------
-- Quick check (optional — uncomment to verify)
-- ---------------------------------------------------------------------------
-- select 'branches' as t, count(*) from shop_branches
-- union all select 'employees', count(*) from branch_employees
-- union all select 'services', count(*) from branch_services
-- union all select 'bookings', count(*) from bookings where shop_id = 'shop-wash-nile'
-- union all select 'owners', count(*) from users where role = 'owner'
-- union all select 'managers', count(*) from users where role = 'branch_manager';
