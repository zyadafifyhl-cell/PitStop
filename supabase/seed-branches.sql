-- Demo branch managers (optional — run after migrate-roles-branches.sql)
-- Create Auth users first in Dashboard:
--   manager.wash@demo.com / demo123  → branch manager for Nile Auto Wash main branch
--
-- Then link them:

-- Example: promote auth user to branch_manager (replace UUID after creating Auth user)
-- update public.users
-- set role = 'branch_manager',
--     shop_id = 'shop-wash-nile',
--     branch_id = (select id from public.shop_branches where shop_id = 'shop-wash-nile' and slug = 'main')
-- where email = 'manager.wash@demo.com';

-- Example employee roster (no login)
insert into public.branch_employees (shop_id, branch_id, full_name, phone, job_title)
select
  b.shop_id,
  b.id,
  v.full_name,
  v.phone,
  v.job_title
from public.shop_branches b
cross join (
  values
    ('Ahmed Salah', '+201012345678', 'Washer'),
    ('Karim Nabil', '+201098765432', 'Supervisor')
) as v(full_name, phone, job_title)
where b.shop_id = 'shop-wash-nile'
  and b.slug = 'main'
  and not exists (
    select 1 from public.branch_employees e
    where e.branch_id = b.id and e.full_name = v.full_name
  );

-- Second branch for multi-branch demo (Nile Auto Wash — Maadi 2)
insert into public.shop_branches (
  shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
  latitude, longitude, is_default, sort_order
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
  false,
  1
)
on conflict (shop_id, slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  address = excluded.address,
  address_ar = excluded.address_ar;
