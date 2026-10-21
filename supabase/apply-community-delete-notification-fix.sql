-- Reliable author lookup + customer-readable notification RPC.

create or replace function public.resolve_community_author_id(
  p_author_user_id text,
  p_author_label text
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_author text := trim(coalesce(p_author_user_id, ''));
begin
  if v_author <> '' then
    return v_author;
  end if;
  if trim(coalesce(p_author_label, '')) = '' then
    return '';
  end if;

  select u.id::text
  into v_author
  from public.users u
  where lower(trim(u.full_name)) = lower(trim(p_author_label))
  order by case when u.role = 'customer' then 0 else 1 end, u.created_at desc
  limit 1;

  return coalesce(v_author, '');
end;
$$;

create or replace function public.list_my_in_app_notifications()
returns table (
  id uuid,
  customer_id text,
  kind text,
  title text,
  message text,
  message_ar text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select n.id, n.customer_id, n.kind, n.title, n.message, n.message_ar, n.created_at
  from public.customer_in_app_notifications n
  where auth.uid() is not null
    and n.customer_id = auth.uid()::text
  order by n.created_at desc;
$$;

revoke all on function public.list_my_in_app_notifications() from public;
grant execute on function public.list_my_in_app_notifications() to authenticated;
