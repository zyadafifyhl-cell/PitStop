-- Driver Network reports: persist to a queue the Super Admin can see,
-- even when the reporter has no auth.uid() session or the post is local-only.

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('post', 'comment')),
  target_id text not null,
  reporter_id text not null default '',
  title text not null default '',
  body text not null default '',
  author_label text not null default '',
  status text not null default 'open' check (status in ('open', 'dismissed', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists community_reports_open_idx
  on public.community_reports (status, created_at desc)
  where status = 'open';

create unique index if not exists community_reports_open_uniq
  on public.community_reports (kind, target_id, reporter_id)
  where status = 'open';

alter table public.community_reports enable row level security;

drop policy if exists "Anyone can insert community reports" on public.community_reports;
create policy "Anyone can insert community reports"
  on public.community_reports for insert
  with check (true);

drop policy if exists "Platform admins read community reports" on public.community_reports;
create policy "Platform admins read community reports"
  on public.community_reports for select
  using (public.is_platform_admin());

drop policy if exists "Platform admins update community reports" on public.community_reports;
create policy "Platform admins update community reports"
  on public.community_reports for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.report_community_item(
  p_kind text,
  p_target_id text,
  p_reporter_id text default '',
  p_title text default '',
  p_body text default '',
  p_author_label text default ''
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
      kind, target_id, reporter_id, title, body, author_label, status
    ) values (
      v_kind, v_target, v_reporter,
      coalesce(p_title, ''),
      coalesce(p_body, ''),
      coalesce(p_author_label, ''),
      'open'
    )
    returning id into v_id;
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

create or replace function public.list_community_moderation()
returns table (
  id uuid,
  kind text,
  target_id text,
  title text,
  body text,
  author_label text,
  created_at timestamptz,
  report_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    (array_agg(r.id order by r.created_at desc))[1] as id,
    r.kind,
    r.target_id,
    (array_agg(r.title order by r.created_at desc))[1] as title,
    (array_agg(r.body order by r.created_at desc))[1] as body,
    (array_agg(r.author_label order by r.created_at desc))[1] as author_label,
    max(r.created_at) as created_at,
    count(*)::integer as report_count
  from public.community_reports r
  where r.status = 'open'
  group by r.kind, r.target_id
  order by max(r.created_at) desc;
end;
$$;

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

  update public.community_reports
  set status = case when v_action = 'delete' then 'deleted' else 'dismissed' end
  where kind = v_kind
    and target_id = v_target
    and status = 'open';

  if v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_uuid := v_target::uuid;
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
end;
$$;

revoke all on function public.report_community_item(text, text, text, text, text, text) from public;
grant execute on function public.report_community_item(text, text, text, text, text, text) to anon, authenticated;

revoke all on function public.list_community_moderation() from public;
grant execute on function public.list_community_moderation() to authenticated;

revoke all on function public.admin_resolve_community_report(text, text, text) from public;
grant execute on function public.admin_resolve_community_report(text, text, text) to authenticated;
