-- PitStop 2.0 — Step 12: Wash loyalty stamps (app + walk-in POS)
-- Run in Supabase SQL Editor after prior steps.

create table if not exists public.customer_wash_loyalty (
  customer_key text primary key,
  customer_id uuid references auth.users(id) on delete set null,
  customer_phone text,
  stamps integer not null default 0 check (stamps >= 0 and stamps <= 10),
  processed_booking_ids jsonb not null default '[]'::jsonb,
  pending_reward jsonb,
  rewards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists customer_wash_loyalty_customer_id_idx
  on public.customer_wash_loyalty (customer_id);

create index if not exists customer_wash_loyalty_phone_idx
  on public.customer_wash_loyalty (customer_phone);

alter table public.customer_wash_loyalty enable row level security;

drop policy if exists "Customers read own wash loyalty" on public.customer_wash_loyalty;
create policy "Customers read own wash loyalty" on public.customer_wash_loyalty
  for select using (
    (customer_id is not null and customer_id = auth.uid())
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'customer'::public.user_role
        and u.phone is not null
        and customer_phone is not null
        and (
          u.phone = customer_phone
          or u.phone = '+20' || substring(customer_phone from 2)
          or customer_phone = '+20' || substring(u.phone from 2)
        )
    )
  );

-- Idempotent stamp when a wash booking is marked done (walk-in with phone or app customer).
create or replace function public.record_wash_loyalty_stamp_for_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_key text;
  v_state public.customer_wash_loyalty%rowtype;
  v_ids jsonb;
  v_reward jsonb;
  v_stamp_added boolean := false;
  v_reward_unlocked jsonb := null;
  v_goal constant integer := 5;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('stampAdded', false, 'stamps', 0, 'rewardUnlocked', null);
  end if;

  if v_booking.shop_type <> 'wash' or v_booking.status <> 'done' then
    return jsonb_build_object('stampAdded', false, 'stamps', 0, 'rewardUnlocked', null);
  end if;

  if not (
    public.can_manage_shop(v_booking.shop_id)
    or (v_booking.customer_id is not null and v_booking.customer_id = auth.uid())
  ) then
    raise exception 'not authorized to record loyalty for this booking';
  end if;

  if v_booking.customer_id is not null then
    v_key := 'id:' || v_booking.customer_id::text;
  elsif nullif(trim(v_booking.customer_phone), '') is not null then
    v_key := 'phone:' || trim(v_booking.customer_phone);
  else
    return jsonb_build_object('stampAdded', false, 'stamps', 0, 'rewardUnlocked', null);
  end if;

  select * into v_state from public.customer_wash_loyalty where customer_key = v_key;
  if not found then
    v_state.customer_key := v_key;
    v_state.customer_id := v_booking.customer_id;
    v_state.customer_phone := nullif(trim(v_booking.customer_phone), '');
    v_state.stamps := 0;
    v_state.processed_booking_ids := '[]'::jsonb;
    v_state.pending_reward := null;
    v_state.rewards := '[]'::jsonb;
  end if;

  v_ids := coalesce(v_state.processed_booking_ids, '[]'::jsonb);
  if v_ids @> to_jsonb(p_booking_id::text) then
    return jsonb_build_object(
      'stampAdded', false,
      'stamps', v_state.stamps,
      'rewardUnlocked', null,
      'customerKey', v_key
    );
  end if;

  v_ids := v_ids || to_jsonb(p_booking_id::text);
  if jsonb_array_length(v_ids) > 200 then
    v_ids := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (
        select elem
        from jsonb_array_elements(v_ids) with ordinality t(elem, ord)
        where ord > jsonb_array_length(v_ids) - 200
      ) s
    );
  end if;

  v_state.processed_booking_ids := v_ids;
  v_state.stamps := least(v_state.stamps + 1, v_goal);
  v_stamp_added := true;

  if v_state.stamps >= v_goal then
    v_reward := jsonb_build_object(
      'id', 'loyalty-reward-' || extract(epoch from now())::bigint,
      'code', 'LOYAL-' || upper(substr(md5(random()::text), 1, 6)),
      'discountType', 'percent',
      'discountValue', 100,
      'issuedAt', now(),
      'expiresAt', now() + interval '90 days',
      'redeemed', false
    );
    v_state.rewards := jsonb_build_array(v_reward) || coalesce(v_state.rewards, '[]'::jsonb);
    v_state.rewards := (
      select coalesce(jsonb_agg(elem), '[]'::jsonb)
      from (
        select elem
        from jsonb_array_elements(v_state.rewards) with ordinality t(elem, ord)
        where ord <= 20
      ) s
    );
    v_state.pending_reward := v_reward;
    v_state.stamps := 0;
    v_reward_unlocked := v_reward;
  end if;

  v_state.customer_id := coalesce(v_state.customer_id, v_booking.customer_id);
  v_state.customer_phone := coalesce(v_state.customer_phone, nullif(trim(v_booking.customer_phone), ''));
  v_state.updated_at := now();

  insert into public.customer_wash_loyalty as c (
    customer_key, customer_id, customer_phone, stamps,
    processed_booking_ids, pending_reward, rewards, updated_at
  ) values (
    v_state.customer_key, v_state.customer_id, v_state.customer_phone, v_state.stamps,
    v_state.processed_booking_ids, v_state.pending_reward, v_state.rewards, v_state.updated_at
  )
  on conflict (customer_key) do update set
    customer_id = excluded.customer_id,
    customer_phone = excluded.customer_phone,
    stamps = excluded.stamps,
    processed_booking_ids = excluded.processed_booking_ids,
    pending_reward = excluded.pending_reward,
    rewards = excluded.rewards,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'stampAdded', v_stamp_added,
    'stamps', v_state.stamps,
    'rewardUnlocked', v_reward_unlocked,
    'customerKey', v_key
  );
end;
$$;

revoke all on function public.record_wash_loyalty_stamp_for_booking(uuid) from public;
grant execute on function public.record_wash_loyalty_stamp_for_booking(uuid) to authenticated;

comment on function public.record_wash_loyalty_stamp_for_booking(uuid) is
  'When a wash booking is done, increment loyalty stamps for linked customer/phone (walk-in POS or app).';
