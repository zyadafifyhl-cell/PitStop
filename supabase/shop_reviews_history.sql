-- Shop reviews history for merchant dashboards (RPC + owner_replied_at)

alter table public.shop_reviews
  add column if not exists owner_replied_at timestamptz;

alter table public.shop_reviews
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

alter table public.shop_reviews
  add column if not exists store_order_id uuid references public.store_orders(id) on delete set null;

create index if not exists shop_reviews_booking_id_idx
  on public.shop_reviews (booking_id)
  where booking_id is not null;

create index if not exists shop_reviews_store_order_id_idx
  on public.shop_reviews (store_order_id)
  where store_order_id is not null;

drop function if exists public.get_shop_reviews_history(text);

create or replace function public.get_shop_reviews_history(p_shop_id text)
returns table (
  id uuid,
  shop_id text,
  user_id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  is_hidden boolean,
  owner_reply text,
  owner_replied_at timestamptz,
  reported boolean,
  reviewer_name text,
  reviewer_email text,
  reviewer_phone text,
  service_reference text,
  order_reference text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.shop_id,
    r.customer_id as user_id,
    r.rating,
    r.body as comment,
    r.created_at,
    coalesce(r.hidden, false) as is_hidden,
    r.owner_reply,
    r.owner_replied_at,
    coalesce(r.reported, false) as reported,
    coalesce(nullif(trim(u.full_name), ''), r.customer_name) as reviewer_name,
    u.email as reviewer_email,
    u.phone as reviewer_phone,
    case
      when b.id is not null then coalesce(nullif(trim(b.service_name), ''), 'Service booking')
      else null
    end as service_reference,
    case
      when o.id is not null then coalesce('Order #' || left(o.id::text, 8), 'Store order')
      else null
    end as order_reference
  from public.shop_reviews r
  left join public.users u on u.id = r.customer_id
  left join public.bookings b on b.id = r.booking_id
  left join public.store_orders o on o.id = r.store_order_id
  where r.shop_id = p_shop_id
    and public.can_manage_shop(p_shop_id)
  order by r.created_at desc;
$$;

revoke all on function public.get_shop_reviews_history(text) from public;
grant execute on function public.get_shop_reviews_history(text) to authenticated;
