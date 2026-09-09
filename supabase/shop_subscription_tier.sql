-- PitStop Pro: subscription columns on public.shops + keep admin premium toggle in sync.

alter table public.shops
  add column if not exists subscription_tier text not null default 'free',
  add column if not exists subscription_status text not null default 'active',
  add column if not exists subscription_expires_at timestamptz;

update public.shops
set subscription_tier = 'pro'
where coalesce(is_premium, false) = true
  and coalesce(subscription_tier, 'free') not in ('pro', 'enterprise');

alter table public.shops drop constraint if exists shops_subscription_tier_check;
alter table public.shops
  add constraint shops_subscription_tier_check
  check (subscription_tier in ('free', 'pro', 'enterprise'));

alter table public.shops drop constraint if exists shops_subscription_status_check;
alter table public.shops
  add constraint shops_subscription_status_check
  check (subscription_status in ('active', 'expired', 'trial'));

comment on column public.shops.subscription_tier is
  'Shop SaaS plan: free | pro | enterprise';
comment on column public.shops.subscription_status is
  'Shop SaaS status: active | expired | trial';
comment on column public.shops.subscription_expires_at is
  'When the current paid plan ends, if set.';

create or replace function public.admin_toggle_shop_premium(
  p_shop_id text,
  p_is_premium boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_premium boolean := coalesce(p_is_premium, false);
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  update public.shops
  set
    is_premium = v_premium,
    subscription_tier = case when v_premium then 'pro' else 'free' end,
    subscription_status = 'active',
    updated_at = now()
  where id = p_shop_id
    and is_active = true;

  if not found then
    raise exception 'Active shop not found';
  end if;
end;
$$;

grant execute on function public.admin_toggle_shop_premium(text, boolean) to authenticated;
