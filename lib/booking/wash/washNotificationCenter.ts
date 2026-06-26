import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WashCenterNotification, WashCenterNotificationKind } from '@/lib/booking/wash/types';

const KEY = '@pitstop/wash-owner-notifications/v1';
type NotificationMap = Record<string, WashCenterNotification[]>;

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return `wn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readMap(): Promise<NotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as NotificationMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

export async function listWashCenterNotifications(shopId: string): Promise<WashCenterNotification[]> {
  const map = await readMap();
  return (map[shopId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function pushWashCenterNotification(input: {
  shopId: string;
  branchId?: string;
  kind: WashCenterNotificationKind;
  title: string;
  body: string;
  bookingId?: string;
  reviewId?: string;
}): Promise<WashCenterNotification> {
  const map = await readMap();
  const row: WashCenterNotification = {
    id: id(),
    shopId: input.shopId,
    branchId: input.branchId,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    read: false,
    createdAt: nowIso(),
    bookingId: input.bookingId,
    reviewId: input.reviewId,
  };
  map[input.shopId] = [row, ...(map[input.shopId] ?? [])].slice(0, 200);
  await writeMap(map);
  return row;
}

export async function markWashNotificationRead(shopId: string, notificationId: string): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) =>
    row.id === notificationId ? { ...row, read: true } : row,
  );
  await writeMap(map);
}

export async function deleteWashNotification(shopId: string, notificationId: string): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).filter((row) => row.id !== notificationId);
  await writeMap(map);
}

export async function clearWashNotifications(shopId: string): Promise<void> {
  const map = await readMap();
  map[shopId] = [];
  await writeMap(map);
}

export async function countUnreadWashNotifications(shopId: string): Promise<number> {
  const rows = await listWashCenterNotifications(shopId);
  return rows.filter((row) => !row.read).length;
}

export async function markAllWashNotificationsRead(shopId: string): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) => ({ ...row, read: true }));
  await writeMap(map);
}
