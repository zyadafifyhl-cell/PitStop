import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CustomerVehicle } from '@/lib/booking/types';

const VEHICLES_KEY = '@pitstop/customer-vehicles/v1';
const ACTIVE_VEHICLE_KEY = '@pitstop/active-vehicle/v1';
const LEGACY_PROFILE_PREFIX = '@pitstop/car-profile/';

type VehicleMap = Record<string, CustomerVehicle[]>;
type ActiveVehicleMap = Record<string, string>;

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return `veh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bucket(customerId: string): string {
  return customerId.trim();
}

async function readMap(): Promise<VehicleMap> {
  try {
    const raw = await AsyncStorage.getItem(VEHICLES_KEY);
    const parsed = raw ? (JSON.parse(raw) as VehicleMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: VehicleMap): Promise<void> {
  await AsyncStorage.setItem(VEHICLES_KEY, JSON.stringify(map));
}

async function readActiveMap(): Promise<ActiveVehicleMap> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_VEHICLE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ActiveVehicleMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeActiveMap(map: ActiveVehicleMap): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_VEHICLE_KEY, JSON.stringify(map));
}

export async function getActiveVehicleId(customerId: string): Promise<string | null> {
  const map = await readActiveMap();
  return map[bucket(customerId)] ?? null;
}

export async function setActiveVehicle(customerId: string, vehicleId: string): Promise<CustomerVehicle | null> {
  const map = await readMap();
  const key = bucket(customerId);
  const rows = map[key] ?? [];
  const idx = rows.findIndex((row) => row.id === vehicleId);
  if (idx < 0) return null;

  const [picked] = rows.splice(idx, 1);
  picked.updatedAt = nowIso();
  map[key] = [picked, ...rows];
  await writeMap(map);

  const activeMap = await readActiveMap();
  activeMap[key] = vehicleId;
  await writeActiveMap(activeMap);
  await AsyncStorage.setItem(
    `${LEGACY_PROFILE_PREFIX}${customerId}`,
    JSON.stringify({ carType: picked.makeModel }),
  );
  return picked;
}

async function migrateLegacyProfile(customerId: string): Promise<CustomerVehicle[]> {
  try {
    const raw = await AsyncStorage.getItem(`${LEGACY_PROFILE_PREFIX}${customerId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { carType?: string };
    if (!parsed.carType?.trim()) return [];
    const vehicle: CustomerVehicle = {
      id: id(),
      label: parsed.carType.trim(),
      makeModel: parsed.carType.trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const map = await readMap();
    map[bucket(customerId)] = [vehicle];
    await writeMap(map);
    return map[bucket(customerId)];
  } catch {
    return [];
  }
}

export async function listCustomerVehicles(customerId: string): Promise<CustomerVehicle[]> {
  const map = await readMap();
  const rows = map[bucket(customerId)] ?? [];
  if (rows.length) return rows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return migrateLegacyProfile(customerId);
}

export async function addCustomerVehicle(
  customerId: string,
  input: { label?: string; makeModel: string; color?: string; plate?: string },
): Promise<CustomerVehicle[]> {
  const map = await readMap();
  const key = bucket(customerId);
  const row: CustomerVehicle = {
    id: id(),
    label: input.label?.trim() || input.makeModel.trim(),
    makeModel: input.makeModel.trim(),
    color: input.color?.trim() || undefined,
    plate: input.plate?.trim() || undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  map[key] = [row, ...(map[key] ?? [])];
  await writeMap(map);
  const activeMap = await readActiveMap();
  activeMap[key] = row.id;
  await writeActiveMap(activeMap);
  await AsyncStorage.setItem(`${LEGACY_PROFILE_PREFIX}${customerId}`, JSON.stringify({ carType: row.makeModel }));
  return map[key];
}

export async function updateCustomerVehicle(
  customerId: string,
  vehicleId: string,
  input: Partial<Pick<CustomerVehicle, 'label' | 'makeModel' | 'color' | 'plate'>>,
): Promise<CustomerVehicle[]> {
  const map = await readMap();
  const key = bucket(customerId);
  map[key] = (map[key] ?? []).map((row) => {
    if (row.id !== vehicleId) return row;
    const next = {
      ...row,
      label: input.label?.trim() || row.label,
      makeModel: input.makeModel?.trim() || row.makeModel,
      color: input.color?.trim() || row.color,
      plate: input.plate?.trim() || row.plate,
      updatedAt: nowIso(),
    };
    return next;
  });
  await writeMap(map);
  const primary = map[key]?.[0];
  if (primary) {
    await AsyncStorage.setItem(`${LEGACY_PROFILE_PREFIX}${customerId}`, JSON.stringify({ carType: primary.makeModel }));
  }
  return map[key] ?? [];
}

export async function removeCustomerVehicle(customerId: string, vehicleId: string): Promise<CustomerVehicle[]> {
  const map = await readMap();
  const key = bucket(customerId);
  map[key] = (map[key] ?? []).filter((row) => row.id !== vehicleId);
  await writeMap(map);
  const primary = map[key]?.[0];
  const activeMap = await readActiveMap();
  if (activeMap[key] === vehicleId) {
    if (primary) activeMap[key] = primary.id;
    else delete activeMap[key];
    await writeActiveMap(activeMap);
  }
  if (primary) {
    await AsyncStorage.setItem(`${LEGACY_PROFILE_PREFIX}${customerId}`, JSON.stringify({ carType: primary.makeModel }));
  } else {
    await AsyncStorage.removeItem(`${LEGACY_PROFILE_PREFIX}${customerId}`);
  }
  return map[key] ?? [];
}

export async function getPrimaryVehicle(customerId: string): Promise<CustomerVehicle | null> {
  const rows = await listCustomerVehicles(customerId);
  if (!rows.length) return null;
  const activeId = await getActiveVehicleId(customerId);
  if (activeId) {
    const match = rows.find((row) => row.id === activeId);
    if (match) return match;
  }
  return rows[0] ?? null;
}

/** Keep primary vehicle in sync when the Home tab car profile card is saved. */
export async function syncPrimaryVehicleFromCarType(customerId: string, carType: string): Promise<void> {
  const trimmed = carType.trim();
  if (!trimmed) return;
  const rows = await listCustomerVehicles(customerId);
  if (!rows.length) {
    await addCustomerVehicle(customerId, { makeModel: trimmed, label: trimmed });
    return;
  }
  await updateCustomerVehicle(customerId, rows[0].id, { makeModel: trimmed, label: trimmed });
}
