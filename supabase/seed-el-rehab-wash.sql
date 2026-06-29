-- =============================================================================
-- El Rehab City — demo wash owner + branch (location workflow QA)
-- Run in Supabase SQL Editor AFTER schema + step2 migrations.
--
-- BEFORE section 4: create Auth user in Dashboard → Authentication → Users:
--   rehab.wash@demo.com / demo123  (Auto Confirm User ✓)
-- =============================================================================

-- 1) Area: El Rehab
insert into public.areas (id, name, name_ar, city, city_ar)
values ('el-rehab', 'El Rehab', 'الرحاب', 'Cairo', 'القاهرة')
on conflict (id) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  city = excluded.city,
  city_ar = excluded.city_ar;

-- 2) Shop brand
insert into public.shops (
  id, name, name_ar, type, area_id, address, address_ar, phone,
  latitude, longitude, owner_email, rating, is_active, is_premium
)
values (
  'shop-wash-rehab',
  'Rehab City Auto Wash',
  'مغسلة الرحاب',
  'wash',
  'el-rehab',
  'El Rehab City, New Cairo',
  'مدينة الرحاب، القاهرة الجديدة',
  '+201088887766',
  30.0244,
  31.4939,
  'rehab.wash@demo.com',
  4.8,
  true,
  false
)
on conflict (id) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  area_id = excluded.area_id,
  address = excluded.address,
  address_ar = excluded.address_ar,
  phone = excluded.phone,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  owner_email = excluded.owner_email,
  updated_at = now();

-- 3) Physical branch (exact El Rehab coordinates)
insert into public.shop_branches (
  shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
  latitude, longitude, profile_name, profile_name_ar,
  service_price_egp, service_duration_minutes, shop_status, is_default, sort_order
)
values (
  'shop-wash-rehab',
  'main',
  'Rehab City Auto Wash',
  'مغسلة الرحاب',
  'el-rehab',
  'El Rehab City, New Cairo',
  'مدينة الرحاب، القاهرة الجديدة',
  '+201088887766',
  30.0244,
  31.4939,
  'Rehab City Auto Wash',
  'مغسلة الرحاب',
  200,
  45,
  'open',
  true,
  0
)
on conflict (shop_id, slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  area_id = excluded.area_id,
  address = excluded.address,
  address_ar = excluded.address_ar,
  phone = excluded.phone,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  profile_name = excluded.profile_name,
  profile_name_ar = excluded.profile_name_ar,
  service_price_egp = excluded.service_price_egp,
  updated_at = now();

-- 4) Link Auth user → public.users (owner)
insert into public.users (id, email, full_name, role, shop_id, is_active)
select
  au.id,
  lower(au.email),
  'Rehab City Auto Wash',
  'owner'::public.user_role,
  'shop-wash-rehab',
  true
from auth.users au
where lower(au.email) = 'rehab.wash@demo.com'
on conflict (id) do update set
  role = 'owner'::public.user_role,
  shop_id = excluded.shop_id,
  email = excluded.email,
  is_active = true,
  updated_at = now();

-- 5) Back-link shop.owner_user_id
update public.shops s
set owner_user_id = u.id, updated_at = now()
from public.users u
where s.id = 'shop-wash-rehab'
  and u.email = 'rehab.wash@demo.com';

-- Verify:
-- select s.id, s.owner_email, s.latitude, s.longitude, b.latitude, b.longitude
-- from public.shops s
-- join public.shop_branches b on b.shop_id = s.id and b.slug = 'main'
-- where s.id = 'shop-wash-rehab';
