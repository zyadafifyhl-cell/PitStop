alter table public.branch_services
  add column if not exists price_varies_by_vehicle boolean not null default false;
