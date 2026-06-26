-- PitStop 2.0 — step 3: branch manager assignment RPC + owner read policy
-- Run in Supabase SQL Editor AFTER step1 + step2.

-- Owners can list staff rows for their shop (needed for branch manager UI).
drop policy if exists "Shop owners can read shop users" on public.users;
create policy "Shop owners can read shop users"
  on public.users for select
  using (
    auth.uid() = id
    or (shop_id is not null and public.is_shop_owner(shop_id))
  );

-- Owner assigns an Auth user (by id) to manage a branch.
create or replace function public.assign_branch_manager(
  p_user_id uuid,
  p_branch_id uuid,
  p_full_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id text;
begin
  if p_user_id is null or p_branch_id is null then
    raise exception 'User id and branch id are required';
  end if;

  select b.shop_id into v_shop_id
  from public.shop_branches b
  where b.id = p_branch_id and b.is_active;

  if v_shop_id is null then
    raise exception 'Branch not found';
  end if;

  if not public.is_shop_owner(v_shop_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.users (id, email, full_name, role, shop_id, branch_id, created_by)
  select
    p_user_id,
    lower(au.email),
    coalesce(nullif(trim(p_full_name), ''), au.email),
    'branch_manager'::public.user_role,
    v_shop_id,
    p_branch_id,
    auth.uid()
  from auth.users au
  where au.id = p_user_id
  on conflict (id) do update set
    role = 'branch_manager'::public.user_role,
    shop_id = excluded.shop_id,
    branch_id = excluded.branch_id,
    full_name = coalesce(nullif(trim(p_full_name), ''), public.users.full_name),
    created_by = coalesce(public.users.created_by, auth.uid()),
    is_active = true,
    updated_at = now();

  update public.shop_branches
  set manager_user_id = p_user_id, updated_at = now()
  where id = p_branch_id;
end;
$$;

-- Same as above, but lookup Auth user by email (fixes users stuck as customer).
create or replace function public.assign_branch_manager_by_email(
  p_email text,
  p_branch_id uuid,
  p_full_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select au.id into v_user_id
  from auth.users au
  where lower(au.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for this email';
  end if;

  perform public.assign_branch_manager(v_user_id, p_branch_id, p_full_name);
end;
$$;

revoke all on function public.assign_branch_manager(uuid, uuid, text) from public;
grant execute on function public.assign_branch_manager(uuid, uuid, text) to authenticated;

revoke all on function public.assign_branch_manager_by_email(text, uuid, text) from public;
grant execute on function public.assign_branch_manager_by_email(text, uuid, text) to authenticated;
