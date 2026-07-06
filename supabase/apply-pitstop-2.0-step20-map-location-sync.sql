-- PitStop 2.0 — Step 20: PostGIS map discovery + shop/branch location sync
-- Fixes merchant branch GPS not appearing on customer map (shops table was stale + RLS gap).

create extension if not exists postgis;

alter table public.shops
  add column if not exists geog geography(Point, 4326);

alter table public.shop_branches
  add column if not exists geog geography(Point, 4326);

update public.shops
set geog = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where latitude is not null
  and longitude is not null
  and geog is null;

update public.shop_branches
set geog = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where latitude is not null
  and longitude is not null
  and geog is null;

update public.shop_branches b
set geog = s.geog
from public.shops s
where s.id = b.shop_id
  and b.geog is null
  and s.geog is not null;

create index if not exists shops_geog_gix on public.shops using gist (geog);
create index if not exists shop_branches_geog_gix on public.shop_branches using gist (geog);

create or replace function public.sync_shop_geog_from_latlng()
returns trigger
language plpgsql
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  else
    new.geog := null;
  end if;
  return new;
end;
$$;

create or replace function public.sync_branch_geog_from_latlng()
returns trigger
language plpgsql
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geog := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  else
    new.geog := null;
  end if;
  return new;
end;
$$;

drop trigger if exists shops_sync_geog on public.shops;
create trigger shops_sync_geog
  before insert or update of latitude, longitude on public.shops
  for each row execute function public.sync_shop_geog_from_latlng();

drop trigger if exists shop_branches_sync_geog on public.shop_branches;
create trigger shop_branches_sync_geog
  before insert or update of latitude, longitude on public.shop_branches
  for each row execute function public.sync_branch_geog_from_latlng();

-- Mirror default branch GPS onto shops (customer catalog + legacy readers).
create or replace function public.sync_shop_coords_from_default_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_default, false) and coalesce(new.is_active, true)
     and new.latitude is not null and new.longitude is not null then
    update public.shops
    set latitude = new.latitude,
        longitude = new.longitude,
        updated_at = now()
    where id = new.shop_id;
  end if;
  return new;
end;
$$;

drop trigger if exists shop_branches_sync_shop_coords on public.shop_branches;
create trigger shop_branches_sync_shop_coords
  after insert or update of latitude, longitude, is_default, is_active on public.shop_branches
  for each row execute function public.sync_shop_coords_from_default_branch();

-- Back-fill shops from their default active branch pins.
update public.shops s
set latitude = b.latitude,
    longitude = b.longitude,
    updated_at = now()
from public.shop_branches b
where b.shop_id = s.id
  and b.is_default = true
  and b.is_active = true
  and b.latitude is not null
  and b.longitude is not null
  and (s.latitude is distinct from b.latitude or s.longitude is distinct from b.longitude);

-- Allow shop owners to persist map pins on the parent shop row.
drop policy if exists "Owners update shop location" on public.shops;
create policy "Owners update shop location"
  on public.shops
  for update
  using (is_shop_owner(id))
  with check (is_shop_owner(id));

create or replace function public.upsert_shop_map_location(
  p_shop_id text,
  p_latitude double precision,
  p_longitude double precision
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_shop_owner(p_shop_id) and not is_platform_admin() then
    raise exception 'not authorized to update shop location';
  end if;

  update public.shops
  set latitude = p_latitude,
      longitude = p_longitude,
      updated_at = now()
  where id = p_shop_id;

  return found;
end;
$$;

grant execute on function public.upsert_shop_map_location(text, double precision, double precision) to authenticated;

create or replace function public.find_nearby_listings(
  p_lat numeric,
  p_lng numeric,
  p_type text,
  p_radius_km numeric default 50,
  p_limit int default 100
)
returns table (
  shop_id text,
  branch_id uuid,
  branch_slug text,
  listing_name text,
  listing_name_ar text,
  listing_address text,
  listing_address_ar text,
  listing_phone text,
  latitude double precision,
  longitude double precision,
  shop_type text,
  area_id text,
  owner_email text,
  is_premium boolean,
  distance_km double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_geog geography;
  v_radius_m double precision;
  v_limit int;
  v_type public.shop_type;
begin
  if p_type not in ('wash', 'maintenance') then
    raise exception 'unsupported shop type: %', p_type;
  end if;

  v_type := p_type::public.shop_type;
  v_limit := greatest(coalesce(p_limit, 100), 1);
  v_radius_m := greatest(coalesce(p_radius_km, 50), 0.1) * 1000.0;

  if p_lat is not null and p_lng is not null then
    v_user_geog := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  end if;

  if v_type = 'maintenance' then
    return query
    select
      s.id,
      null::uuid,
      null::text,
      s.name,
      s.name_ar,
      s.address,
      s.address_ar,
      s.phone,
      s.latitude,
      s.longitude,
      s.type::text,
      s.area_id,
      s.owner_email,
      s.is_premium,
      case
        when v_user_geog is not null and s.geog is not null
          then st_distance(s.geog, v_user_geog) / 1000.0
        else null::double precision
      end
    from public.shops s
    where s.is_active
      and s.type = v_type
      and s.geog is not null
      and (
        v_user_geog is null
        or st_dwithin(s.geog, v_user_geog, v_radius_m)
      )
    order by
      case when v_user_geog is null then 0 else 1 end,
      distance_km asc nulls last,
      s.name asc
    limit v_limit;
    return;
  end if;

  return query
  with branch_rows as (
    select
      s.id as shop_id,
      b.id as branch_id,
      b.slug as branch_slug,
      coalesce(b.profile_name, b.name, s.name) as listing_name,
      coalesce(b.profile_name_ar, b.name_ar, s.name_ar) as listing_name_ar,
      coalesce(b.address, s.address) as listing_address,
      coalesce(b.address_ar, s.address_ar) as listing_address_ar,
      coalesce(b.phone, s.phone) as listing_phone,
      coalesce(b.latitude, s.latitude) as latitude,
      coalesce(b.longitude, s.longitude) as longitude,
      s.type::text as shop_type,
      coalesce(b.area_id, s.area_id) as area_id,
      s.owner_email,
      s.is_premium,
      coalesce(b.geog, s.geog) as listing_geog
    from public.shop_branches b
    join public.shops s on s.id = b.shop_id
    where b.is_active
      and s.is_active
      and s.type = 'wash'::public.shop_type
      and coalesce(b.geog, s.geog) is not null
  ),
  shop_only as (
    select
      s.id as shop_id,
      null::uuid as branch_id,
      'main'::text as branch_slug,
      s.name as listing_name,
      s.name_ar as listing_name_ar,
      s.address as listing_address,
      s.address_ar as listing_address_ar,
      s.phone as listing_phone,
      s.latitude,
      s.longitude,
      s.type::text as shop_type,
      s.area_id,
      s.owner_email,
      s.is_premium,
      s.geog as listing_geog
    from public.shops s
    where s.is_active
      and s.type = 'wash'::public.shop_type
      and s.geog is not null
      and not exists (
        select 1
        from public.shop_branches b
        where b.shop_id = s.id
          and b.is_active
      )
  ),
  combined as (
    select * from branch_rows
    union all
    select * from shop_only
  )
  select
    c.shop_id,
    c.branch_id,
    c.branch_slug,
    c.listing_name,
    c.listing_name_ar,
    c.listing_address,
    c.listing_address_ar,
    c.listing_phone,
    c.latitude,
    c.longitude,
    c.shop_type,
    c.area_id,
    c.owner_email,
    c.is_premium,
    case
      when v_user_geog is not null and c.listing_geog is not null
        then st_distance(c.listing_geog, v_user_geog) / 1000.0
      else null::double precision
    end as distance_km
  from combined c
  where v_user_geog is null
     or st_dwithin(c.listing_geog, v_user_geog, v_radius_m)
  order by
    case when v_user_geog is null then 0 else 1 end,
    distance_km asc nulls last,
    c.listing_name asc
  limit v_limit;
end;
$$;

grant execute on function public.find_nearby_listings(numeric, numeric, text, numeric, int) to anon, authenticated;
