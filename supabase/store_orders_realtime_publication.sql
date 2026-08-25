-- Ensure store_orders is in supabase_realtime for web + native INSERT alerts
alter table public.store_orders replica identity full;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_orders'
  ) then
    execute 'alter publication supabase_realtime add table public.store_orders';
  end if;
end $$;
