-- When Super Admin deletes a reported Driver Network item, hide it from every feed
-- including local-only posts that were never stored in public.posts.

create table if not exists public.community_removed_items (
  kind text not null check (kind in ('post', 'comment')),
  target_id text not null,
  removed_at timestamptz not null default now(),
  primary key (kind, target_id)
);

alter table public.community_removed_items enable row level security;

drop policy if exists "Anyone can read removed community items" on public.community_removed_items;
create policy "Anyone can read removed community items"
  on public.community_removed_items for select
  using (true);

grant select on public.community_removed_items to anon, authenticated;

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

  if v_action = 'delete' then
    insert into public.community_removed_items (kind, target_id)
    values (v_kind, v_target)
    on conflict (kind, target_id) do update set removed_at = now();
  end if;

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

insert into public.community_removed_items (kind, target_id)
select distinct r.kind, r.target_id
from public.community_reports r
where r.status = 'deleted'
on conflict (kind, target_id) do nothing;

delete from public.posts p
where exists (
  select 1
  from public.community_removed_items r
  where r.kind = 'post'
    and r.target_id = p.id::text
);

delete from public.comments c
where exists (
  select 1
  from public.community_removed_items r
  where r.kind = 'comment'
    and r.target_id = c.id::text
);
