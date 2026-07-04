-- PitStop 2.0 — Step 14d: Community media extensions & author FK alignment
-- Run in Supabase SQL Editor after step 8 (community feed) and step 14c.
-- Enables comment image uploads and PostgREST users(full_name, role) joins on posts/comments.

-- 1. Add image_url column to comments if it doesn't exist
alter table public.comments add column if not exists image_url text;

-- 2. Fix posts foreign key constraint to ensure clean cascaded deletes for moderation
alter table public.posts drop constraint if exists posts_user_id_fkey;
alter table public.posts
  add constraint posts_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

-- 3. Fix comments foreign key constraint for clean cascaded deletes as well
alter table public.comments drop constraint if exists comments_user_id_fkey;
alter table public.comments
  add constraint comments_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

comment on column public.comments.image_url is 'Optional media attachment URL for comment or reply';
