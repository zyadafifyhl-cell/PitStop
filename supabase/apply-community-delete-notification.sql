-- Notify the original author when Super Admin deletes a Driver Network post.

alter table public.community_reports
  add column if not exists author_user_id text not null default '';

create table if not exists public.customer_in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  kind text not null default 'community_post_removed',
  title text not null default '',
  message text not null,
  message_ar text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists customer_in_app_notifications_customer_idx
  on public.customer_in_app_notifications (customer_id, created_at desc);

alter table public.customer_in_app_notifications enable row level security;

drop policy if exists "Users can read own in-app notifications" on public.customer_in_app_notifications;
create policy "Users can read own in-app notifications"
  on public.customer_in_app_notifications for select
  using (auth.uid() is not null and customer_id = auth.uid()::text);

grant select on public.customer_in_app_notifications to authenticated;

drop function if exists public.report_community_item(text, text, text, text, text, text);
drop function if exists public.report_community_item(text, text, text, text, text, text, text);

create or replace function public.report_community_item(
  p_kind text,
  p_target_id text,
  p_reporter_id text default '',
  p_title text default '',
  p_body text default '',
  p_author_label text default '',
  p_author_user_id text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_target text := trim(coalesce(p_target_id, ''));
  v_reporter text := trim(coalesce(p_reporter_id, ''));
  v_author text := trim(coalesce(p_author_user_id, ''));
  v_id uuid;
  v_uuid uuid;
begin
  if v_kind not in ('post', 'comment') then
    raise exception 'invalid report kind';
  end if;
  if v_target = '' then
    raise exception 'missing report target';
  end if;

  select r.id into v_id
  from public.community_reports r
  where r.kind = v_kind
    and r.target_id = v_target
    and r.reporter_id = v_reporter
    and r.status = 'open'
  limit 1;

  if v_id is null then
    insert into public.community_reports (
      kind, target_id, reporter_id, title, body, author_label, author_user_id, status
    ) values (
      v_kind, v_target, v_reporter,
      coalesce(p_title, ''),
      coalesce(p_body, ''),
      coalesce(p_author_label, ''),
      v_author,
      'open'
    )
    returning id into v_id;
  elsif v_author <> '' then
    update public.community_reports
    set author_user_id = v_author
    where id = v_id and coalesce(author_user_id, '') = '';
  end if;

  if v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_uuid := v_target::uuid;
    if v_kind = 'post' then
      update public.posts set reported = true where id = v_uuid;
    else
      update public.comments set reported = true where id = v_uuid;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.report_community_item(text, text, text, text, text, text, text) from public;
grant execute on function public.report_community_item(text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_resolve_community_report(
  p_kind text,
  p_target_id text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_target text := trim(coalesce(p_target_id, ''));
  v_action text := lower(trim(coalesce(p_action, '')));
  v_uuid uuid;
  v_author text := '';
  v_title text := '';
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;
  if v_kind not in ('post', 'comment') then
    raise exception 'invalid report kind';
  end if;
  if v_action not in ('dismiss', 'delete') then
    raise exception 'invalid report action';
  end if;

  select coalesce(nullif(trim(r.author_user_id), ''), ''), coalesce(nullif(trim(r.title), ''), '')
  into v_author, v_title
  from public.community_reports r
  where r.kind = v_kind
    and r.target_id = v_target
  order by r.created_at desc
  limit 1;

  update public.community_reports
  set status = case when v_action = 'delete' then 'deleted' else 'dismissed' end
  where kind = v_kind
    and target_id = v_target
    and status = 'open';

  if v_action = 'delete' then
    insert into public.community_removed_items (kind, target_id)
    values (v_kind, v_target)
    on conflict (kind, target_id) do update set removed_at = now();
  end if;

  if v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_uuid := v_target::uuid;
    if v_author = '' and v_kind = 'post' then
      select coalesce(p.user_id::text, '') into v_author from public.posts p where p.id = v_uuid;
    elsif v_author = '' and v_kind = 'comment' then
      select coalesce(c.user_id::text, '') into v_author from public.comments c where c.id = v_uuid;
    end if;
    if v_title = '' and v_kind = 'post' then
      select coalesce(p.title, '') into v_title from public.posts p where p.id = v_uuid;
    end if;

    if v_action = 'delete' then
      if v_kind = 'post' then
        delete from public.posts where id = v_uuid;
      else
        delete from public.comments where id = v_uuid;
      end if;
    else
      if v_kind = 'post' then
        update public.posts set reported = false where id = v_uuid;
      else
        update public.comments set reported = false where id = v_uuid;
      end if;
    end if;
  end if;

  if v_action = 'delete' and v_kind = 'post' and v_author <> '' then
    insert into public.customer_in_app_notifications (
      customer_id, kind, title, message, message_ar
    ) values (
      v_author,
      'community_post_removed',
      v_title,
      'Your post "' || coalesce(nullif(v_title, ''), 'Untitled') || '" was removed because it violated PitStop community rules.',
      'تم حذف منشورك "' || coalesce(nullif(v_title, ''), 'بدون عنوان') || '" لأنه خالف قواعد المجتمع على الموقع.'
    );
  end if;
end;
$$;
