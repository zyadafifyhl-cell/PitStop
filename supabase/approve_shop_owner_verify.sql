-- Make merchant approval fail closed unless the shops row is actually activated.

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
    owner_email = coalesce(
      (select lower(u.email) from public.users u where u.id = p_target_user_id),
      owner_email
    ),
    updated_at = now()
  where id = p_target_shop_id;

  if not found then
    raise exception 'Shop not found for approval';
  end if;

  if not exists (
    select 1
    from public.shops s
    where s.id = p_target_shop_id
      and s.is_active
      and s.owner_user_id = p_target_user_id
  ) then
    raise exception 'Shop was not activated';
  end if;
end;
$$;

grant execute on function public.approve_shop_owner(uuid, text) to authenticated;
