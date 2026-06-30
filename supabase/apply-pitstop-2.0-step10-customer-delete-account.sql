-- Step 10: Customer self-service account deletion RPC
-- Run in Supabase SQL Editor after steps 1–9.

create or replace function public.customer_delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.customer_delete_own_account() from public;
grant execute on function public.customer_delete_own_account() to authenticated;
