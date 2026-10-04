-- Let owners change the public shop phone after registration.

create or replace function public.sync_shop_phone_from_default_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_default, false) and coalesce(new.is_active, true)
     and nullif(trim(coalesce(new.phone, '')), '') is not null then
    update public.shops
    set phone = trim(new.phone),
        updated_at = now()
    where id = new.shop_id
      and phone is distinct from trim(new.phone);
  end if;
  return new;
end;
$$;

drop trigger if exists shop_branches_sync_shop_phone on public.shop_branches;
create trigger shop_branches_sync_shop_phone
  after insert or update of phone, is_default, is_active on public.shop_branches
  for each row execute function public.sync_shop_phone_from_default_branch();

create or replace function public.upsert_shop_contact_phone(
  p_shop_id text,
  p_phone text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := trim(p_phone);
  v_updated boolean := false;
begin
  if not public.is_shop_owner(p_shop_id)
     and not public.can_manage_shop(p_shop_id)
     and not public.is_platform_admin() then
    raise exception 'not authorized to update shop phone';
  end if;

  if nullif(v_phone, '') is null then
    raise exception 'shop phone is required';
  end if;

  update public.shops
  set phone = v_phone,
      updated_at = now()
  where id = p_shop_id;
  v_updated := found;

  update public.shop_branches
  set phone = v_phone,
      updated_at = now()
  where shop_id = p_shop_id
    and is_active = true
    and is_default = true;

  return v_updated;
end;
$$;

grant execute on function public.upsert_shop_contact_phone(text, text) to authenticated;
