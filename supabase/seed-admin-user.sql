  -- PitStop — create platform admin (admin@demo.com / demo123)
  -- Run in Supabase Dashboard AFTER creating the Auth user (see steps below).

  -- STEP 1 (Dashboard, not SQL):
  --   Authentication → Users → Add user
  --   Email: admin@demo.com
  --   Password: demo123
  --   ✓ Auto Confirm User  (important — otherwise login says "wrong password")
  --
  -- STEP 2: Run apply-pitstop-2.0-step5-admin-approval.sql if not done yet.
  --
  -- STEP 3: Run this file in SQL Editor:

  insert into public.users (id, email, full_name, role, is_active, shop_id)
  select
    au.id,
    lower(au.email),
    coalesce(au.raw_user_meta_data ->> 'name', 'Platform Admin'),
    'admin'::public.user_role,
  true,
  null
from auth.users au
where lower(au.email) = 'admin@demo.com'
on conflict (id) do update set
  role = 'admin'::public.user_role,
  is_active = true,
  shop_id = null,
  updated_at = now();

-- Verify:
-- select id, email, role, is_active, shop_id from public.users where email = 'admin@demo.com';
