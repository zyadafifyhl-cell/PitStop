-- PitStop 2.0 — Steps 7 + 7b + 8 (single run, safe to re-run)
-- Paste into Supabase Dashboard → SQL Editor → Run
-- Project: https://qlopvpyeawauepsyrirz.supabase.co
--
-- Includes:
--   Step 7  — walk_in booking_type + shop_reviews
--   Step 7b — resolve_customer_id_by_phone() for POS loyalty linking
--   Step 8  — community feed (posts, comments, votes, comment_likes)

-- =============================================================================
-- STEP 7 — Walk-in POS bookings + shop reviews
-- =============================================================================
do $$ begin
  create type public.booking_type as enum ('app', 'walk_in');
exception
  when duplicate_object then null;
end $$;

alter table public.bookings
  add column if not exists booking_type public.booking_type not null default 'app';

alter table public.bookings alter column customer_id drop not null;
alter table public.bookings alter column customer_phone drop not null;

create index if not exists bookings_booking_type_idx on public.bookings (booking_type);

comment on column public.bookings.booking_type is
  'app = customer booked via mobile app; walk_in = branch POS / offline registration';

create table if not exists public.shop_reviews (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text not null default '',
  likes integer not null default 0,
  liked_by jsonb not null default '[]'::jsonb,
  owner_reply text,
  hidden boolean not null default false,
  reported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_reviews_shop_id_idx on public.shop_reviews (shop_id);
create index if not exists shop_reviews_created_at_idx on public.shop_reviews (shop_id, created_at desc);

alter table public.shop_reviews enable row level security;

drop policy if exists "Anyone can read visible shop reviews" on public.shop_reviews;
create policy "Anyone can read visible shop reviews" on public.shop_reviews
  for select using (hidden = false);

drop policy if exists "Shop staff can read all shop reviews" on public.shop_reviews;
create policy "Shop staff can read all shop reviews" on public.shop_reviews
  for select using (public.can_manage_shop(shop_id));

drop policy if exists "Customers can add shop reviews" on public.shop_reviews;
create policy "Customers can add shop reviews" on public.shop_reviews
  for insert with check (auth.uid() is not null and customer_id = auth.uid());

drop policy if exists "Shop staff can update shop reviews" on public.shop_reviews;
create policy "Shop staff can update shop reviews" on public.shop_reviews
  for update using (public.can_manage_shop(shop_id));

drop policy if exists "Customers can update own review likes" on public.shop_reviews;
create policy "Customers can update own review likes" on public.shop_reviews
  for update using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

-- =============================================================================
-- STEP 7b — Walk-in POS: link phone → customer_id
-- =============================================================================
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

-- =============================================================================
-- STEP 8 — Driver network / community feed
-- =============================================================================
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  image_url text,
  category_tag text not null default 'general',
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_category_tag_idx on public.posts (category_tag);
create index if not exists posts_user_id_idx on public.posts (user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_idx on public.comments (post_id, created_at asc);
create index if not exists comments_parent_id_idx on public.comments (parent_id);

create table if not exists public.post_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  vote_type text not null check (vote_type in ('up', 'down')),
  primary key (user_id, post_id)
);

create index if not exists post_votes_post_id_idx on public.post_votes (post_id);

create table if not exists public.comment_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_votes enable row level security;
alter table public.comment_likes enable row level security;

drop policy if exists "Anyone can read posts" on public.posts;
create policy "Anyone can read posts" on public.posts
  for select using (true);

drop policy if exists "Anyone can read comments" on public.comments;
create policy "Anyone can read comments" on public.comments
  for select using (true);

drop policy if exists "Anyone can read post votes" on public.post_votes;
create policy "Anyone can read post votes" on public.post_votes
  for select using (true);

drop policy if exists "Anyone can read comment likes" on public.comment_likes;
create policy "Anyone can read comment likes" on public.comment_likes
  for select using (true);

drop policy if exists "Users can insert own posts" on public.posts;
create policy "Users can insert own posts" on public.posts
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can delete own posts" on public.posts;
create policy "Users can delete own posts" on public.posts
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can insert own comments" on public.comments;
create policy "Users can insert own comments" on public.comments
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments" on public.comments
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can insert own votes" on public.post_votes;
create policy "Users can insert own votes" on public.post_votes
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can update own votes" on public.post_votes;
create policy "Users can update own votes" on public.post_votes
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own votes" on public.post_votes;
create policy "Users can delete own votes" on public.post_votes
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can insert own comment likes" on public.comment_likes;
create policy "Users can insert own comment likes" on public.comment_likes
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can delete own comment likes" on public.comment_likes;
create policy "Users can delete own comment likes" on public.comment_likes
  for delete using (auth.uid() = user_id);

comment on table public.posts is 'Driver network social feed posts';
comment on table public.comments is 'Threaded comments on feed posts (parent_id for 1-level replies)';
comment on table public.post_votes is 'Per-user likes on feed posts (vote_type up only in app UI)';
comment on table public.comment_likes is 'Per-user likes on comments and replies';

drop policy if exists "Anyone can read feed author profiles" on public.users;
create policy "Anyone can read feed author profiles" on public.users
  for select using (
    exists (select 1 from public.posts p where p.user_id = users.id)
    or exists (select 1 from public.comments c where c.user_id = users.id)
  );

-- =============================================================================
-- Verify (optional — should return rows without errors)
-- =============================================================================
select 'booking_type column' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'booking_type'
  ) as ok;

select 'resolve_customer_id_by_phone' as check_name,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resolve_customer_id_by_phone'
  ) as ok;

select 'community tables' as check_name,
  (
    select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('posts', 'comments', 'post_votes', 'comment_likes')
  ) = 4 as ok;
