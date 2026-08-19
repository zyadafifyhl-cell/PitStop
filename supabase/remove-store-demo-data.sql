-- Remove marketplace fixtures that are not owned by a real merchant.
delete from public.products
where shop_id is null;

-- Legacy placeholder stores are identified by their demo owner accounts.
-- Related public.store rows are removed through the shop foreign key cascade.
delete from public.shops
where type in ('parts', 'accessories')
  and owner_email like '%@demo.com';
