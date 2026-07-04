-- PitStop 2.0 — Step 14c: Deduct merchant loyalty points on booking checkout
-- Run after step 14b.

alter table public.customer_merchant_loyalty
  add column if not exists redeemed_booking_ids jsonb not null default '[]'::jsonb;

create or replace function public.deduct_merchant_loyalty_points(
  p_user_id uuid,
  p_shop_id text,
  p_booking_id uuid,
  p_points_to_redeem integer,
  p_discount_egp numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_shop public.shops%rowtype;
  v_state public.customer_merchant_loyalty%rowtype;
  v_redeemed jsonb;
  v_new_balance integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized to deduct loyalty for another user';
  end if;

  if p_points_to_redeem is null or p_points_to_redeem <= 0 then
    return jsonb_build_object('ok', true, 'skipped', true, 'pointsBalance', 0);
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and customer_id = p_user_id
    and shop_id = p_shop_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  if coalesce(v_booking.points_redeemed, 0) <> p_points_to_redeem then
    return jsonb_build_object('ok', false, 'reason', 'points_mismatch');
  end if;

  if round(coalesce(v_booking.discount_applied_egp, 0), 2)
     <> round(coalesce(p_discount_egp, 0), 2) then
    return jsonb_build_object('ok', false, 'reason', 'discount_mismatch');
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found or coalesce(v_shop.is_loyalty_enabled, true) = false then
    return jsonb_build_object('ok', false, 'reason', 'loyalty_disabled');
  end if;

  select * into v_state
  from public.customer_merchant_loyalty
  where user_id = p_user_id
    and shop_id = p_shop_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ledger_not_found');
  end if;

  v_redeemed := coalesce(v_state.redeemed_booking_ids, '[]'::jsonb);
  if v_redeemed @> to_jsonb(p_booking_id::text) then
    return jsonb_build_object(
      'ok', true,
      'alreadyRedeemed', true,
      'pointsBalance', v_state.points_balance
    );
  end if;

  if v_state.points_balance < p_points_to_redeem then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance');
  end if;

  v_redeemed := v_redeemed || to_jsonb(p_booking_id::text);
  if jsonb_array_length(v_redeemed) > 300 then
    v_redeemed := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (
        select elem
        from jsonb_array_elements(v_redeemed) with ordinality t(elem, ord)
        where ord > jsonb_array_length(v_redeemed) - 300
      ) s
    );
  end if;

  v_new_balance := v_state.points_balance - p_points_to_redeem;

  update public.customer_merchant_loyalty
  set
    points_balance = v_new_balance,
    redeemed_booking_ids = v_redeemed,
    updated_at = now()
  where user_id = p_user_id
    and shop_id = p_shop_id;

  return jsonb_build_object(
    'ok', true,
    'pointsDeducted', p_points_to_redeem,
    'pointsBalance', v_new_balance
  );
end;
$$;

revoke all on function public.deduct_merchant_loyalty_points(uuid, text, uuid, integer, numeric) from public;
grant execute on function public.deduct_merchant_loyalty_points(uuid, text, uuid, integer, numeric) to authenticated;

comment on function public.deduct_merchant_loyalty_points(uuid, text, uuid, integer, numeric) is
  'After booking insert: deduct redeemed points idempotently per booking id.';
