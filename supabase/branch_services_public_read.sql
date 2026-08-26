-- Public read of visible branch menus (customer shop profile / booking).
-- Hidden services stay owner-only via the manager policy.

alter table public.branch_services enable row level security;

drop policy if exists "Anyone can read branch services" on public.branch_services;
create policy "Anyone can read branch services"
  on public.branch_services
  for select
  using (visible = true);

grant select on public.shops to anon, authenticated;
grant select on public.shop_branches to anon, authenticated;
grant select on public.branch_services to anon, authenticated;
