-- PitStop 2.0 — Step 13: Merchant registration keeps Arabic fields empty unless provided
-- Run in Supabase SQL Editor after prior steps.

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
  v_name_ar text := coalesce(nullif(trim(p_shop_name_ar), ''), '');
  v_address_en text := coalesce(nullif(trim(p_address), ''), 'Address pending');
  v_address_ar text := coalesce(nullif(trim(p_address_ar), ''), '');
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
    v_name_ar,
    p_shop_type,
    p_area_id,
    v_address_en,
    v_address_ar,
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
    v_name_ar,
    p_area_id,
    v_address_en,
    v_address_ar,
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

comment on function public.register_shop_owner(text, text, public.shop_type, text, text, text, text) is
  'Owner self-registration: English fields required; Arabic fields stay empty unless explicitly provided.';
