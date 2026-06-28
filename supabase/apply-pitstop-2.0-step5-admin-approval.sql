-- PitStop 2.0 — step 5: Super Admin approval workflow
-- Run AFTER steps 1–4 in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Enum: pending_owner
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.user_role add value if not exists 'pending_owner';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_active
      and u.role = 'admin'::public.user_role
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: admin read access
-- ---------------------------------------------------------------------------
drop policy if exists "Platform admins read users" on public.users;
create policy "Platform admins read users"
  on public.users for select
  using (public.is_platform_admin() or auth.uid() = id);

drop policy if exists "Platform admins read all shops" on public.shops;
create policy "Platform admins read all shops"
  on public.shops for select
  using (public.is_platform_admin() or is_active = true);

drop policy if exists "Platform admins read branches" on public.shop_branches;
create policy "Platform admins read branches"
  on public.shop_branches for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.shops s
      where s.id = shop_branches.shop_id and s.is_active = true
    )
  );

drop policy if exists "Platform admins read bookings" on public.bookings;
create policy "Platform admins read bookings"
  on public.bookings for select
  using (public.is_platform_admin());

-- Customer catalog: only active shops (re-assert)
drop policy if exists "Anyone can read shops" on public.shops;
create policy "Anyone can read shops"
  on public.shops for select
  using (is_active = true or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Owner self-registration (creates inactive shop + pending_owner user)
-- ---------------------------------------------------------------------------
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
  v_area_exists boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email = '' then
    raise exception 'User email required';
  end if;

  if nullif(trim(p_shop_name), '') is null then
    raise exception 'Shop name is required';
  end if;

  select exists(select 1 from public.areas where id = p_area_id) into v_area_exists;
  if not v_area_exists then
    raise exception 'Invalid area';
  end if;

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
  )
  values (
    v_shop_id,
    trim(p_shop_name),
    coalesce(nullif(trim(p_shop_name_ar), ''), trim(p_shop_name)),
    p_shop_type,
    p_area_id,
    coalesce(nullif(trim(p_address), ''), 'Address pending'),
    coalesce(nullif(trim(p_address_ar), ''), coalesce(nullif(trim(p_address), ''), 'Address pending')),
    coalesce(nullif(trim(p_phone), ''), ''),
    30.0,
    31.0,
    v_email,
    v_uid,
    false
  );

  insert into public.shop_branches (
    shop_id, slug, name, name_ar, area_id, address, address_ar, phone,
    is_default, sort_order, is_active
  )
  values (
    v_shop_id,
    'main',
    trim(p_shop_name),
    coalesce(nullif(trim(p_shop_name_ar), ''), trim(p_shop_name)),
    p_area_id,
    coalesce(nullif(trim(p_address), ''), 'Address pending'),
    coalesce(nullif(trim(p_address_ar), ''), coalesce(nullif(trim(p_address), ''), 'Address pending')),
    coalesce(nullif(trim(p_phone), ''), ''),
    true,
    0,
    true
  );

  update public.users
  set
    role = 'pending_owner'::public.user_role,
    shop_id = v_shop_id,
    is_active = false,
    updated_at = now()
  where id = v_uid;

  return v_shop_id;
end;
$$;

grant execute on function public.register_shop_owner(text, text, public.shop_type, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin approve / reject
-- ---------------------------------------------------------------------------
create or replace function public.approve_shop_owner(
  p_target_user_id uuid,
  p_target_shop_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_target_user_id
      and u.role = 'pending_owner'::public.user_role
      and u.shop_id = p_target_shop_id
  ) then
    raise exception 'Pending owner request not found';
  end if;

  update public.users
  set
    role = 'owner'::public.user_role,
    is_active = true,
    updated_at = now()
  where id = p_target_user_id;

  update public.shops
  set
    is_active = true,
    owner_user_id = p_target_user_id,
    updated_at = now()
  where id = p_target_shop_id;
end;
$$;

grant execute on function public.approve_shop_owner(uuid, text) to authenticated;

create or replace function public.reject_shop_owner(
  p_target_user_id uuid,
  p_target_shop_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_target_user_id
      and u.role = 'pending_owner'::public.user_role
      and u.shop_id = p_target_shop_id
  ) then
    raise exception 'Pending owner request not found';
  end if;

  delete from public.shop_branches where shop_id = p_target_shop_id;
  delete from public.shops where id = p_target_shop_id;

  update public.users
  set
    role = 'customer'::public.user_role,
    shop_id = null,
    is_active = true,
    updated_at = now()
  where id = p_target_user_id;
end;
$$;

grant execute on function public.reject_shop_owner(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Link an Auth user as platform admin (run manually once):
-- update public.users set role = 'admin', is_active = true, shop_id = null where email = 'admin@demo.com';
