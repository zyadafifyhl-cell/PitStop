import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShopType } from '@/lib/booking/types';

const KEY = '@pitstop/recent-locations/v1';
const MAX_RECENT = 6;

type RecentMap = Record<string, string[]>;

function bucket(type: ShopType): string {
  return type;
}

async function readMap(): Promise<RecentMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: RecentMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

export async function listRecentAreaIds(type: ShopType): Promise<string[]> {
  const map = await readMap();
  return (map[bucket(type)] ?? []).slice(0, MAX_RECENT);
}

export async function rememberAreaSelection(type: ShopType, areaId: string): Promise<void> {
  const id = areaId.trim();
  if (!id) return;
  const map = await readMap();
  const key = bucket(type);
  const prev = map[key] ?? [];
  map[key] = [id, ...prev.filter((row) => row !== id)].slice(0, MAX_RECENT);
  await writeMap(map);
}
