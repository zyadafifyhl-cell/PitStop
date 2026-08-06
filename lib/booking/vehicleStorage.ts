import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CustomerVehicle } from '@/lib/booking/types';
import {
  addUserVehicleRemote,
  getActiveUserVehicleIdRemote,
  listUserVehiclesRemote,
  removeUserVehicleRemote,
  setActiveUserVehicleRemote,
  syncLocalVehiclesToRemote,
  updateUserVehicleRemote,
} from '@/lib/booking/vehicleRepository';

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

async function writeLocalCache(customerId: string, rows: CustomerVehicle[], activeVehicleId?: string | null): Promise<void> {
  const key = bucket(customerId);
  const map = await readMap();
  map[key] = rows;
  await writeMap(map);

  const activeMap = await readActiveMap();
  const activeId = activeVehicleId ?? rows[0]?.id;
  if (activeId) activeMap[key] = activeId;
  else delete activeMap[key];
  await writeActiveMap(activeMap);

  const primary = rows.find((row) => row.id === activeId) ?? rows[0];
  if (primary) {
    await AsyncStorage.setItem(
      `${LEGACY_PROFILE_PREFIX}${customerId}`,
      JSON.stringify({ carType: primary.makeModel }),
    );
  }
}

export async function getActiveVehicleId(customerId: string): Promise<string | null> {
  const remoteActiveId = await getActiveUserVehicleIdRemote(customerId);
  if (remoteActiveId) return remoteActiveId;

  const map = await readActiveMap();
  return map[bucket(customerId)] ?? null;
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

async function readLocalVehicles(customerId: string): Promise<CustomerVehicle[]> {
  const map = await readMap();
  const rows = map[bucket(customerId)] ?? [];
  if (rows.length) return rows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return migrateLegacyProfile(customerId);
}

async function resolveVehiclesFromRemote(customerId: string): Promise<CustomerVehicle[] | null> {
  const remoteRows = await listUserVehiclesRemote(customerId);
  if (remoteRows.length) {
    const activeId = (await getActiveUserVehicleIdRemote(customerId)) ?? remoteRows[0]?.id ?? null;
    await writeLocalCache(customerId, remoteRows, activeId);
    return remoteRows;
  }

  const localRows = await readLocalVehicles(customerId);
  if (!localRows.length) return [];

  const activeMap = await readActiveMap();
  const activeId = activeMap[bucket(customerId)] ?? localRows[0]?.id ?? null;
  const synced = await syncLocalVehiclesToRemote(customerId, localRows, activeId);
  if (synced.length) {
    const syncedActiveId = (await getActiveUserVehicleIdRemote(customerId)) ?? synced[0]?.id ?? null;
    await writeLocalCache(customerId, synced, syncedActiveId);
    return synced;
  }

  return null;
}

export async function listCustomerVehicles(customerId: string): Promise<CustomerVehicle[]> {
  const remoteResolved = await resolveVehiclesFromRemote(customerId);
  if (remoteResolved) return remoteResolved;
  return readLocalVehicles(customerId);
}

export async function setActiveVehicle(customerId: string, vehicleId: string): Promise<CustomerVehicle | null> {
  const remotePicked = await setActiveUserVehicleRemote(customerId, vehicleId);
  if (remotePicked) {
    const rows = await listCustomerVehicles(customerId);
    await writeLocalCache(customerId, rows, remotePicked.id);
    return remotePicked;
  }

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

export async function addCustomerVehicle(
  customerId: string,
  input: { label?: string; makeModel: string; color?: string; plate?: string },
): Promise<CustomerVehicle[]> {
  const remoteCreated = await addUserVehicleRemote(customerId, { ...input, setActive: true });
  if (remoteCreated) {
    const rows = await listCustomerVehicles(customerId);
    await writeLocalCache(customerId, rows, remoteCreated.id);
    return rows;
  }

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
  const remoteUpdated = await updateUserVehicleRemote(customerId, vehicleId, input);
  if (remoteUpdated) {
    const rows = await listCustomerVehicles(customerId);
    const activeId = (await getActiveUserVehicleIdRemote(customerId)) ?? rows[0]?.id ?? null;
    await writeLocalCache(customerId, rows, activeId);
    return rows;
  }

  const map = await readMap();
  const key = bucket(customerId);
  map[key] = (map[key] ?? []).map((row) => {
    if (row.id !== vehicleId) return row;
    return {
      ...row,
      label: input.label?.trim() || row.label,
      makeModel: input.makeModel?.trim() || row.makeModel,
      color: input.color?.trim() || row.color,
      plate: input.plate?.trim() || row.plate,
      updatedAt: nowIso(),
    };
  });
  await writeMap(map);
  const primary = map[key]?.[0];
  if (primary) {
    await AsyncStorage.setItem(`${LEGACY_PROFILE_PREFIX}${customerId}`, JSON.stringify({ carType: primary.makeModel }));
  }
  return map[key] ?? [];
}

export async function removeCustomerVehicle(customerId: string, vehicleId: string): Promise<CustomerVehicle[]> {
  const remoteRemoved = await removeUserVehicleRemote(customerId, vehicleId);
  if (remoteRemoved) {
    const rows = await listCustomerVehicles(customerId);
    const activeId = (await getActiveUserVehicleIdRemote(customerId)) ?? rows[0]?.id ?? null;
    await writeLocalCache(customerId, rows, activeId);
    return rows;
  }

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

export async function getActiveVehicle(customerId: string): Promise<CustomerVehicle | null> {
  const rows = await listCustomerVehicles(customerId);
  if (!rows.length) return null;

  const activeId = await getActiveVehicleId(customerId);
  if (activeId) {
    const hit = rows.find((row) => row.id === activeId);
    if (hit) return hit;
  }

  const fallback = rows[0];
  await writeLocalCache(customerId, rows, fallback.id);
  if (fallback.id !== activeId) {
    await setActiveUserVehicleRemote(customerId, fallback.id);
  }
  return fallback;
}

export async function loadVehiclePickerState(customerId: string): Promise<{
  vehicles: CustomerVehicle[];
  activeVehicle: CustomerVehicle | null;
}> {
  const vehicles = await listCustomerVehicles(customerId);
  const activeVehicle = await getActiveVehicle(customerId);
  return { vehicles, activeVehicle };
}

export async function getPrimaryVehicle(customerId: string): Promise<CustomerVehicle | null> {
  const explicit = await getActiveVehicle(customerId);
  if (explicit) return explicit;
  const rows = await listCustomerVehicles(customerId);
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
