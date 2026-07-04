-- PitStop 2.0 — Step 14b: Per-merchant loyalty RPCs + booking checkout amount columns
-- Run in Supabase SQL Editor after step 14.

-- Checkout / earn amounts (Step 4 checkout writes these; RPC falls back to service_price_egp)
alter table public.bookings
  add column if not exists original_price_egp numeric(10, 2),
  add column if not exists points_redeemed integer not null default 0,
  add column if not exists discount_applied_egp numeric(10, 2) not null default 0,
  add column if not exists final_amount_paid_egp numeric(10, 2);

update public.bookings
set
  original_price_egp = coalesce(original_price_egp, service_price_egp),
  final_amount_paid_egp = coalesce(final_amount_paid_egp, service_price_egp)
where original_price_egp is null
   or final_amount_paid_egp is null;

alter table public.bookings
  alter column final_amount_paid_egp set default 0;

-- ---------------------------------------------------------------------------
-- Earn: 1 point per EGP 10 net paid (floor) when booking is done
-- ---------------------------------------------------------------------------
create or replace function public.calculate_and_add_loyalty_points(p_booking_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
  v_shop_id text;
  v_user_id uuid;
  v_shop public.shops%rowtype;
  v_state public.customer_merchant_loyalty%rowtype;
  v_final_amount_paid_egp numeric(10, 2);
  v_points_earned integer;
  v_ids jsonb;
begin
  begin
    v_booking_id := p_booking_id::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('ok', false, 'reason', 'invalid_booking_id');
  end;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_booking_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  select coalesce(
    nullif(trim(v_booking.shop_id), ''),
    sb.shop_id
  ) into v_shop_id
  from public.shop_branches sb
  where sb.id = v_booking.branch_id
  limit 1;

  v_shop_id := coalesce(v_shop_id, nullif(trim(v_booking.shop_id), ''));

  if v_shop_id is null then
    return jsonb_build_object('ok', false, 'reason', 'shop_not_resolved');
  end if;

  if v_booking.status <> 'done' then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_done');
  end if;

  if not (
    public.can_manage_shop(v_shop_id)
    or (v_booking.customer_id is not null and v_booking.customer_id = auth.uid())
  ) then
    raise exception 'not authorized to award loyalty for this booking';
  end if;

  v_user_id := v_booking.customer_id;
  if v_user_id is null and nullif(trim(v_booking.customer_phone), '') is not null then
    v_user_id := public.resolve_customer_id_by_phone(trim(v_booking.customer_phone));
  end if;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_customer_account');
  end if;

  select * into v_shop from public.shops where id = v_shop_id;
  if not found or coalesce(v_shop.is_loyalty_enabled, true) = false then
    return jsonb_build_object(
      'ok', false,
      'reason', 'loyalty_disabled',
      'shopId', v_shop_id,
      'userId', v_user_id
    );
  end if;

  select * into v_state
  from public.customer_merchant_loyalty
  where user_id = v_user_id
    and shop_id = v_shop_id;

  v_ids := coalesce(v_state.processed_booking_ids, '[]'::jsonb);
  if v_ids @> to_jsonb(p_booking_id) or v_ids @> to_jsonb(v_booking_id::text) then
    return jsonb_build_object(
      'ok', true,
      'pointsAdded', false,
      'pointsEarned', 0,
      'pointsBalance', coalesce(v_state.points_balance, 0),
      'shopId', v_shop_id,
      'userId', v_user_id
    );
  end if;

  v_final_amount_paid_egp := v_booking.final_amount_paid_egp;
  v_points_earned := floor(coalesce(v_final_amount_paid_egp, 0) / 10)::integer;

  v_ids := v_ids || to_jsonb(p_booking_id);
  if jsonb_array_length(v_ids) > 300 then
    v_ids := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (
        select elem
        from jsonb_array_elements(v_ids) with ordinality t(elem, ord)
        where ord > jsonb_array_length(v_ids) - 300
      ) s
    );
  end if;

  insert into public.customer_merchant_loyalty as c (
    user_id,
    shop_id,
    points_balance,
    processed_booking_ids,
    updated_at
  ) values (
    v_user_id,
    v_shop_id,
    v_points_earned,
    v_ids,
    now()
  )
  on conflict (user_id, shop_id) do update set
    points_balance = c.points_balance + excluded.points_balance,
    processed_booking_ids = excluded.processed_booking_ids,
    updated_at = now()
  returning * into v_state;

  return jsonb_build_object(
    'ok', true,
    'pointsAdded', v_points_earned > 0,
    'pointsEarned', v_points_earned,
    'pointsBalance', v_state.points_balance,
    'shopId', v_shop_id,
    'userId', v_user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Validate redemption: 10 points = EGP 1 discount, capped by balance + invoice
-- Does NOT deduct points (deduction happens at booking insert in Step 4)
-- ---------------------------------------------------------------------------
create or replace function public.validate_and_apply_points_redemption(
  p_user_id uuid,
  p_shop_id text,
  p_points_to_redeem integer,
  p_invoice_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop public.shops%rowtype;
  v_state public.customer_merchant_loyalty%rowtype;
  v_balance integer;
  v_requested integer;
  v_max_points_from_balance integer;
  v_max_points_from_invoice integer;
  v_points_allowed integer;
  v_discount numeric(10, 2);
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized to validate redemption for another user';
  end if;

  if p_points_to_redeem is null or p_points_to_redeem <= 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_points',
      'pointsRequested', coalesce(p_points_to_redeem, 0),
      'pointsAllowed', 0,
      'discountEgp', 0,
      'balance', 0
    );
  end if;

  select * into v_shop from public.shops where id = p_shop_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'shop_not_found');
  end if;

  if coalesce(v_shop.is_loyalty_enabled, true) = false then
    return jsonb_build_object(
      'ok', false,
      'reason', 'loyalty_disabled',
      'pointsRequested', p_points_to_redeem,
      'pointsAllowed', 0,
      'discountEgp', 0,
      'balance', 0
    );
  end if;

  select * into v_state
  from public.customer_merchant_loyalty
  where user_id = p_user_id
    and shop_id = p_shop_id;

  v_balance := coalesce(v_state.points_balance, 0);
  v_requested := p_points_to_redeem;
  v_max_points_from_balance := v_balance;
  v_max_points_from_invoice := floor(greatest(coalesce(p_invoice_total, 0), 0) * 10)::integer;

  v_points_allowed := least(
    v_requested,
    v_max_points_from_balance,
    v_max_points_from_invoice
  );

  if v_points_allowed <= 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_points_or_invoice',
      'pointsRequested', v_requested,
      'pointsAllowed', 0,
      'discountEgp', 0,
      'balance', v_balance
    );
  end if;

  v_discount := round((v_points_allowed::numeric / 10), 2);

  return jsonb_build_object(
    'ok', true,
    'pointsRequested', v_requested,
    'pointsAllowed', v_points_allowed,
    'discountEgp', v_discount,
    'balance', v_balance
  );
end;
$$;

revoke all on function public.calculate_and_add_loyalty_points(text) from public;
grant execute on function public.calculate_and_add_loyalty_points(text) to authenticated;

revoke all on function public.validate_and_apply_points_redemption(uuid, text, integer, numeric) from public;
grant execute on function public.validate_and_apply_points_redemption(uuid, text, integer, numeric) to authenticated;

comment on function public.calculate_and_add_loyalty_points(text) is
  'Idempotent earn on done booking: floor(final_amount_paid_egp / 10) points per merchant.';

comment on function public.validate_and_apply_points_redemption(uuid, text, integer, numeric) is
  'Returns allowed points + EGP discount (10 pts = EGP 1) without mutating balance.';
