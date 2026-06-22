/**
 * Browser build: expo-sqlite's published package does not ship wa-sqlite.wasm, and
 * Metro would need extra wasm/COEP setup. This module mirrors the native DB API
 * using localStorage so `npx expo start` + web works for UI testing.
 */

import { EGYPT_CATALOG } from '@/lib/egyptCatalog';

import type { CatalogServiceWithState, GarageSnapshotV1, UserVehicleRow } from '@/lib/storage.types';

export type { CatalogServiceWithState, GarageSnapshotV1, UserVehicleRow } from '@/lib/storage.types';

const STORAGE_KEY = 'pitstop_web_v1';

type CatalogCarRow = {
  id: number;
  brand: string;
  model: string;
  variant: string | null;
  notes: string | null;
};

type CatalogServiceRow = {
  id: number;
  catalog_car_id: number;
  service_key: string;
  label: string;
  interval_km: number | null;
  interval_months: number | null;
  notes: string | null;
};

type UserVehicleStored = {
  id: number;
  catalog_car_id: number;
  nickname: string | null;
  current_odometer: number;
  created_at: string;
};

type UserServiceStateStored = {
  id: number;
  user_vehicle_id: number;
  catalog_service_id: number;
  last_done_odometer: number | null;
  last_done_at: string | null;
};

type Persisted = {
  catalogCars: CatalogCarRow[];
  catalogServices: CatalogServiceRow[];
  userVehicles: UserVehicleStored[];
  userServiceStates: UserServiceStateStored[];
  nextUserVehicleId: number;
  nextUserServiceStateId: number;
};

let cache: Persisted | null = null;

function emptyState(): Persisted {
  return {
    catalogCars: [],
    catalogServices: [],
    userVehicles: [],
    userServiceStates: [],
    nextUserVehicleId: 1,
    nextUserServiceStateId: 1,
  };
}

function seedCatalog(p: Persisted) {
  let carId = 1;
  let svcId = 1;
  for (const car of EGYPT_CATALOG) {
    p.catalogCars.push({
      id: carId,
      brand: car.brand,
      model: car.model,
      variant: car.variant ?? null,
      notes: car.notes ?? null,
    });
    for (const svc of car.services) {
      p.catalogServices.push({
        id: svcId++,
        catalog_car_id: carId,
        service_key: svc.serviceKey,
        label: svc.label,
        interval_km: svc.intervalKm,
        interval_months: svc.intervalMonths,
        notes: svc.notes ?? null,
      });
    }
    carId++;
  }
}

function load(): Persisted {
  if (typeof localStorage === 'undefined') {
    const p = emptyState();
    seedCatalog(p);
    return p;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const p = emptyState();
      seedCatalog(p);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      return p;
    }
    const parsed = JSON.parse(raw) as Persisted;
    if (
      !parsed.catalogCars?.length ||
      !Array.isArray(parsed.catalogServices) ||
      !Array.isArray(parsed.userVehicles) ||
      !Array.isArray(parsed.userServiceStates)
    ) {
      const p = emptyState();
      seedCatalog(p);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      return p;
    }
    return parsed;
  } catch {
    const p = emptyState();
    seedCatalog(p);
    return p;
  }
}

function persist() {
  if (cache && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  }
}

function state(): Persisted {
  if (!cache) cache = load();
  return cache;
}

/** Web shim: initializes storage; return type differs from native but callers only `await` it. */
export async function getDb(): Promise<null> {
  cache = load();
  return null;
}

export async function searchCatalogCars(query: string) {
  const s = state();
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...s.catalogCars].sort((a, b) =>
      `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`),
    );
  }
  return s.catalogCars
    .filter((c) => {
      const hay = `${c.brand} ${c.model} ${c.variant ?? ''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
}

export async function listCatalogCars(limit = 500) {
  const s = state();
  return [...s.catalogCars]
    .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`))
    .slice(0, limit)
    .map(({ id, brand, model, variant, notes }) => ({ id, brand, model, variant, notes }));
}

export async function getCatalogCar(id: number) {
  const s = state();
  const c = s.catalogCars.find((x) => x.id === id);
  if (!c) return null;
  return { id: c.id, brand: c.brand, model: c.model, variant: c.variant, notes: c.notes };
}

export async function listUserVehicles(): Promise<UserVehicleRow[]> {
  const s = state();
  return [...s.userVehicles]
    .map((uv) => {
      const cc = s.catalogCars.find((c) => c.id === uv.catalog_car_id);
      if (!cc) return null;
      return {
        id: uv.id,
        catalog_car_id: uv.catalog_car_id,
        nickname: uv.nickname,
        current_odometer: uv.current_odometer,
        created_at: uv.created_at,
        brand: cc.brand,
        model: cc.model,
        variant: cc.variant,
      } satisfies UserVehicleRow;
    })
    .filter((x): x is UserVehicleRow => x != null)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function addUserVehicle(catalogCarId: number, nickname: string | null) {
  const s = state();
  const services = s.catalogServices.filter((x) => x.catalog_car_id === catalogCarId);
  if (!services.length) throw new Error('Unknown catalog vehicle');

  const id = s.nextUserVehicleId++;
  const created_at = new Date().toISOString();
  s.userVehicles.push({
    id,
    catalog_car_id: catalogCarId,
    nickname,
    current_odometer: 0,
    created_at,
  });

  for (const svc of services) {
    s.userServiceStates.push({
      id: s.nextUserServiceStateId++,
      user_vehicle_id: id,
      catalog_service_id: svc.id,
      last_done_odometer: null,
      last_done_at: null,
    });
  }

  persist();
  return id;
}

export async function updateOdometer(userVehicleId: number, km: number) {
  const s = state();
  const uv = s.userVehicles.find((x) => x.id === userVehicleId);
  if (uv) {
    uv.current_odometer = km;
    persist();
  }
}

export async function deleteUserVehicle(userVehicleId: number) {
  const s = state();
  s.userVehicles = s.userVehicles.filter((x) => x.id !== userVehicleId);
  s.userServiceStates = s.userServiceStates.filter((x) => x.user_vehicle_id !== userVehicleId);
  persist();
}

export async function getVehicleServices(userVehicleId: number): Promise<CatalogServiceWithState[]> {
  const s = state();
  const rows = s.userServiceStates.filter((x) => x.user_vehicle_id === userVehicleId);
  const out: CatalogServiceWithState[] = [];
  for (const uss of rows) {
    const cs = s.catalogServices.find((c) => c.id === uss.catalog_service_id);
    if (!cs) continue;
    out.push({
      catalog_service_id: cs.id,
      service_key: cs.service_key,
      label: cs.label,
      interval_km: cs.interval_km,
      interval_months: cs.interval_months,
      notes: cs.notes,
      last_done_odometer: uss.last_done_odometer,
      last_done_at: uss.last_done_at,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function markServiceDone(userVehicleId: number, catalogServiceId: number, odometer: number) {
  const s = state();
  const row = s.userServiceStates.find(
    (x) => x.user_vehicle_id === userVehicleId && x.catalog_service_id === catalogServiceId,
  );
  if (row) {
    row.last_done_odometer = odometer;
    row.last_done_at = new Date().toISOString();
    persist();
  }
}

export async function clearServiceDone(userVehicleId: number, catalogServiceId: number) {
  const s = state();
  const row = s.userServiceStates.find(
    (x) => x.user_vehicle_id === userVehicleId && x.catalog_service_id === catalogServiceId,
  );
  if (row) {
    row.last_done_odometer = null;
    row.last_done_at = null;
    persist();
  }
}

export async function clearUserGarage() {
  const s = state();
  s.userVehicles = [];
  s.userServiceStates = [];
  s.nextUserVehicleId = 1;
  s.nextUserServiceStateId = 1;
  persist();
}

export async function exportGarageSnapshot(): Promise<GarageSnapshotV1> {
  const vehicles = await listUserVehicles();
  const blocks: GarageSnapshotV1['vehicles'] = [];
  for (const v of vehicles) {
    const svc = await getVehicleServices(v.id);
    blocks.push({
      catalog_car_id: v.catalog_car_id,
      nickname: v.nickname,
      current_odometer: v.current_odometer,
      services: svc.map((s) => ({
        catalog_service_id: s.catalog_service_id,
        last_done_odometer: s.last_done_odometer,
        last_done_at: s.last_done_at,
      })),
    });
  }
  return { v: 1, vehicles: blocks };
}

export async function importGarageSnapshot(data: GarageSnapshotV1) {
  if (data.v !== 1 || !Array.isArray(data.vehicles)) throw new Error('Unsupported garage snapshot');

  const s = state();
  s.userVehicles = [];
  s.userServiceStates = [];

  let nextVid = 1;
  let nextSid = 1;

  for (const block of data.vehicles) {
    const userVehicleId = nextVid++;
    const created_at = new Date().toISOString();
    s.userVehicles.push({
      id: userVehicleId,
      catalog_car_id: block.catalog_car_id,
      nickname: block.nickname,
      current_odometer: block.current_odometer,
      created_at,
    });

    const catalogSvcs = s.catalogServices.filter((cs) => cs.catalog_car_id === block.catalog_car_id);
    for (const svc of catalogSvcs) {
      s.userServiceStates.push({
        id: nextSid++,
        user_vehicle_id: userVehicleId,
        catalog_service_id: svc.id,
        last_done_odometer: null,
        last_done_at: null,
      });
    }

    for (const patch of block.services) {
      const row = s.userServiceStates.find(
        (uss) =>
          uss.user_vehicle_id === userVehicleId && uss.catalog_service_id === patch.catalog_service_id,
      );
      if (row) {
        row.last_done_odometer = patch.last_done_odometer;
        row.last_done_at = patch.last_done_at;
      }
    }
  }

  s.nextUserVehicleId = nextVid;
  s.nextUserServiceStateId = nextSid;
  persist();
}
