-- PitStop 2.0 Step 9: Super Admin SaaS (premium toggle, ledger settlement, moderation)
-- Run after steps 7–8 in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Merchant ledger settlement marker
-- ---------------------------------------------------------------------------
alter table public.shops
  add column if not exists platform_fee_last_settled_at timestamptz not null default '1970-01-01'::timestamptz;

comment on column public.shops.platform_fee_last_settled_at is
  'Admin cash settlement watermark — done bookings after this timestamp accrue outstanding platform fees.';

-- ---------------------------------------------------------------------------
-- Community moderation flags
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists reported boolean not null default false;

alter table public.comments
  add column if not exists reported boolean not null default false;

create index if not exists posts_reported_idx on public.posts (reported) where reported = true;
create index if not exists comments_reported_idx on public.comments (reported) where reported = true;
create index if not exists shop_reviews_reported_idx on public.shop_reviews (reported) where reported = true;

-- ---------------------------------------------------------------------------
-- Admin write policies
-- ---------------------------------------------------------------------------
drop policy if exists "Platform admins update shops" on public.shops;
create policy "Platform admins update shops"
  on public.shops for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Platform admins read all shop reviews" on public.shop_reviews;
create policy "Platform admins read all shop reviews"
  on public.shop_reviews for select
  using (public.is_platform_admin() or hidden = false);

drop policy if exists "Platform admins update shop reviews" on public.shop_reviews;
create policy "Platform admins update shop reviews"
  on public.shop_reviews for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Platform admins delete shop reviews" on public.shop_reviews;
create policy "Platform admins delete shop reviews"
  on public.shop_reviews for delete
  using (public.is_platform_admin());

drop policy if exists "Users can report posts" on public.posts;
create policy "Users can report posts"
  on public.posts for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Users can report comments" on public.comments;
create policy "Users can report comments"
  on public.comments for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Platform admins delete posts" on public.posts;
create policy "Platform admins delete posts"
  on public.posts for delete
  using (public.is_platform_admin());

drop policy if exists "Platform admins delete comments" on public.comments;
create policy "Platform admins delete comments"
  on public.comments for delete
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Admin RPC: premium toggle
-- ---------------------------------------------------------------------------
create or replace function public.admin_toggle_shop_premium(
  p_shop_id text,
  p_is_premium boolean
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

  update public.shops
  set
    is_premium = coalesce(p_is_premium, false),
    updated_at = now()
  where id = p_shop_id
    and is_active = true;

  if not found then
    raise exception 'Active shop not found';
  end if;
end;
$$;

grant execute on function public.admin_toggle_shop_premium(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPC: settle accrued platform fees for a merchant
-- ---------------------------------------------------------------------------
create or replace function public.admin_settle_shop_platform_fees(p_shop_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  update public.shops
  set
    platform_fee_last_settled_at = now(),
    updated_at = now()
  where id = p_shop_id
    and is_active = true;

  if not found then
    raise exception 'Active shop not found';
  end if;
end;
$$;

grant execute on function public.admin_settle_shop_platform_fees(text) to authenticated;
