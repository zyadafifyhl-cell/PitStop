-- PitStop 2.0 Step 8: Driver network community feed (Reddit-style posts, votes, nested comments)
-- Run in Supabase SQL Editor after prior step migrations.

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- comments (1-level nested replies via parent_id)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- post_votes (Reddit-style up / down)
-- ---------------------------------------------------------------------------
create table if not exists public.post_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  vote_type text not null check (vote_type in ('up', 'down')),
  primary key (user_id, post_id)
);

create index if not exists post_votes_post_id_idx on public.post_votes (post_id);

-- ---------------------------------------------------------------------------
-- comment_likes (standard heart likes on comments/replies)
-- ---------------------------------------------------------------------------
create table if not exists public.comment_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_votes enable row level security;
alter table public.comment_likes enable row level security;

-- Read: open to everyone (guests + authenticated via anon key)
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

-- Posts: authenticated users manage their own
drop policy if exists "Users can insert own posts" on public.posts;
create policy "Users can insert own posts" on public.posts
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can delete own posts" on public.posts;
create policy "Users can delete own posts" on public.posts
  for delete using (auth.uid() = user_id);

-- Comments: authenticated users manage their own
drop policy if exists "Users can insert own comments" on public.comments;
create policy "Users can insert own comments" on public.comments
  for insert with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments" on public.comments
  for delete using (auth.uid() = user_id);

-- Votes: authenticated users manage their own vote rows
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

-- Allow feed readers to resolve author display names on posts/comments.
drop policy if exists "Anyone can read feed author profiles" on public.users;
create policy "Anyone can read feed author profiles" on public.users
  for select using (
    exists (select 1 from public.posts p where p.user_id = users.id)
    or exists (select 1 from public.comments c where c.user_id = users.id)
  );
