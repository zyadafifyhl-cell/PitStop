-- Lets a shop owner change the area customers find the shop under (Pick area → shop list).
create or replace function public.set_shop_area(p_shop_id text, p_area_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_area text;
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception 'NOT_SHOP_OWNER' using errcode = '42501';
  end if;
  if not exists (select 1 from public.areas where id = p_area_id) then
    raise exception 'UNKNOWN_AREA' using errcode = '22023';
  end if;

  select area_id into v_old_area from public.shops where id = p_shop_id for update;

  update public.shops
     set area_id = p_area_id,
         updated_at = now()
   where id = p_shop_id;

  -- Branches that still carry the shop's previous area follow the move.
  update public.shop_branches
     set area_id = p_area_id
   where shop_id = p_shop_id
     and (area_id is null or area_id = v_old_area);

  return p_area_id;
end;
$$;

revoke all on function public.set_shop_area(text, text) from public, anon;
grant execute on function public.set_shop_area(text, text) to authenticated;
