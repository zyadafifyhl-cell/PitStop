-- PitStop 2.0 Step 7b: Walk-in POS customer lookup by phone
-- Run after apply-pitstop-2.0-step7-walk-in-reviews.sql

-- Resolves an app customer UUID from a walk-in phone entry (E.164 or local 01…).
-- SECURITY DEFINER so shop staff can link loyalty without broad users SELECT access.
create or replace function public.resolve_customer_id_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trim text := nullif(trim(p_phone), '');
  v_local text;
  v_e164 text;
  v_id uuid;
begin
  if v_trim is null then
    return null;
  end if;

  if v_trim like '+20%' then
    v_local := '0' || substring(v_trim from 4);
    v_e164 := v_trim;
  elsif v_trim like '0%' then
    v_local := v_trim;
    v_e164 := '+20' || substring(v_trim from 2);
  else
    v_local := v_trim;
    v_e164 := v_trim;
  end if;

  select u.id
    into v_id
  from public.users u
  where u.role = 'customer'::public.user_role
    and u.is_active = true
    and u.phone is not null
    and (
      u.phone = v_trim
      or u.phone = v_local
      or u.phone = v_e164
    )
  order by u.created_at asc
  limit 1;

  return v_id;
end;
$$;

revoke all on function public.resolve_customer_id_by_phone(text) from public;
grant execute on function public.resolve_customer_id_by_phone(text) to authenticated;

comment on function public.resolve_customer_id_by_phone(text) is
  'Walk-in POS: returns customer auth.users id when phone matches an active app user, else NULL.';
