import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createCustomerInvoiceFromPartsOrder,
  pushOwnerNotification,
  updateCustomerInvoiceOrderStatus,
} from '@/lib/booking/commerceEvents';
import { formatEgp } from '@/lib/booking/reporting';
import type {
  PartsOrder,
  PartsOrderItem,
  PartsOrderStatus,
  StoreCategory,
  StoreItem,
} from '@/lib/booking/types';
import { sendShopPushForPartsOrder } from '@/lib/push/shopPush';
import { getSupabase } from '@/lib/supabase/client';

const INVENTORY_KEY = '@pitstop/store-inventory/v1';
const ORDERS_KEY = '@pitstop/parts-orders/v1';
const PLATFORM_FEE_RATE = 0.08;

type InventoryMap = Record<string, StoreItem[]>;
type OrderMap = Record<string, PartsOrder[]>;

type StoreRow = {
  id: string;
  shop_id: string;
  category: StoreCategory;
  name: string;
  image_url: string | null;
  price_egp: number | string;
  stock_qty: number;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapStoreRow(row: StoreRow): StoreItem {
  return {
    id: row.id,
    shopId: row.shop_id,
    category: row.category,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    priceEgp: Number(row.price_egp),
    stockQty: row.stock_qty,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readInventoryMap(): Promise<InventoryMap> {
  try {
    const raw = await AsyncStorage.getItem(INVENTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as InventoryMap) : {};
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore
  }
  return {};
}

async function writeInventoryMap(map: InventoryMap): Promise<void> {
  await AsyncStorage.setItem(INVENTORY_KEY, JSON.stringify(map));
}

async function readOrderMap(): Promise<OrderMap> {
  try {
    const raw = await AsyncStorage.getItem(ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as OrderMap) : {};
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore
  }
  return {};
}

async function writeOrderMap(map: OrderMap): Promise<void> {
  await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(map));
}

async function fetchStoreFromSupabase(
  shopId: string,
  category: StoreCategory,
): Promise<StoreItem[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('store')
    .select('*')
    .eq('shop_id', shopId)
    .eq('category', category)
    .order('name');

  if (error) {
    console.warn('Failed to load store from Supabase:', error.message);
    return null;
  }

  return ((data ?? []) as StoreRow[]).map(mapStoreRow);
}

export async function listInventoryForShop(
  shopId: string,
  category: StoreCategory,
): Promise<StoreItem[]> {
  const remote = await fetchStoreFromSupabase(shopId, category);
  if (remote) return remote;

  const map = await readInventoryMap();
  return (map[shopId] ?? [])
    .filter((row) => row.category === category)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addInventoryItem(
  shopId: string,
  category: StoreCategory,
  input: { name: string; priceEgp: number; stockQty: number; imageUrl?: string },
): Promise<StoreItem> {
  const ts = nowIso();
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase
      .from('store')
      .insert({
        shop_id: shopId,
        category,
        name: input.name.trim(),
        price_egp: Math.max(0, Math.round(input.priceEgp * 100) / 100),
        stock_qty: Math.max(0, Math.floor(input.stockQty)),
        image_url: input.imageUrl?.trim() || null,
      })
      .select('*')
      .single();

    if (!error && data) return mapStoreRow(data as StoreRow);
  }

  const map = await readInventoryMap();
  const row: StoreItem = {
    id: id('store'),
    shopId,
    category,
    name: input.name.trim(),
    priceEgp: Math.max(0, Math.round(input.priceEgp * 100) / 100),
    stockQty: Math.max(0, Math.floor(input.stockQty)),
    imageUrl: input.imageUrl?.trim() || undefined,
    createdAt: ts,
    updatedAt: ts,
  };
  map[shopId] = [...(map[shopId] ?? []), row];
  await writeInventoryMap(map);
  return row;
}

export async function updateInventoryStock(
  shopId: string,
  category: StoreCategory,
  itemId: string,
  delta: number,
): Promise<StoreItem | null> {
  const supabase = getSupabase();
  const remoteRows = supabase ? await fetchStoreFromSupabase(shopId, category) : null;
  const current = remoteRows?.find((row) => row.id === itemId);

  if (supabase && current) {
    const nextQty = Math.max(0, current.stockQty + delta);
    const { data, error } = await supabase
      .from('store')
      .update({ stock_qty: nextQty, updated_at: nowIso() })
      .eq('id', itemId)
      .select('*')
      .maybeSingle();

    if (!error && data) return mapStoreRow(data as StoreRow);
  }

  const map = await readInventoryMap();
  const rows = map[shopId] ?? [];
  const idx = rows.findIndex((r) => r.id === itemId && r.category === category);
  if (idx < 0) return null;
  const nextQty = Math.max(0, rows[idx].stockQty + delta);
  rows[idx] = { ...rows[idx], stockQty: nextQty, updatedAt: nowIso() };
  map[shopId] = rows;
  await writeInventoryMap(map);
  return rows[idx];
}

export async function listPartsOrdersForShop(shopId: string): Promise<PartsOrder[]> {
  const map = await readOrderMap();
  return (map[shopId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updatePartsOrderStatus(
  shopId: string,
  orderId: string,
  status: PartsOrderStatus,
): Promise<PartsOrder | null> {
  const map = await readOrderMap();
  const rows = map[shopId] ?? [];
  const idx = rows.findIndex((r) => r.id === orderId);
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], status };
  map[shopId] = rows;
  await writeOrderMap(map);
  await updateCustomerInvoiceOrderStatus(orderId, status);
  return rows[idx];
}

export async function createPartsOrder(input: {
  shopId: string;
  storeCategory: StoreCategory;
  customerId?: string;
  customerEmail?: string;
  customerPhone: string;
  shippingAddress: string;
  items: Array<{ partId: string; qty: number }>;
}): Promise<{ order?: PartsOrder; error?: string }> {
  const shopRows = await listInventoryForShop(input.shopId, input.storeCategory);
  if (!shopRows.length) return { error: 'No inventory found for this shop.' };

  const orderItems: PartsOrderItem[] = [];
  for (const wanted of input.items) {
    if (wanted.qty <= 0) continue;
    const part = shopRows.find((r) => r.id === wanted.partId);
    if (!part) return { error: 'Part not found.' };
    if (part.stockQty < wanted.qty) {
      return { error: `${part.name} is out of stock for requested quantity.` };
    }
    orderItems.push({
      partId: part.id,
      name: part.name,
      qty: wanted.qty,
      unitPriceEgp: part.priceEgp,
      lineTotalEgp: Math.round(part.priceEgp * wanted.qty * 100) / 100,
    });
  }

  if (!orderItems.length) return { error: 'Choose at least one part quantity.' };

  const subtotalEgp = Math.round(orderItems.reduce((s, x) => s + x.lineTotalEgp, 0) * 100) / 100;
  const platformFeeEgp = Math.round(subtotalEgp * PLATFORM_FEE_RATE * 100) / 100;
  const totalEgp = Math.round((subtotalEgp + platformFeeEgp) * 100) / 100;

  for (const line of orderItems) {
    await updateInventoryStock(input.shopId, input.storeCategory, line.partId, -line.qty);
  }

  const orderMap = await readOrderMap();
  const order: PartsOrder = {
    id: id('porder'),
    shopId: input.shopId,
    customerId: input.customerId,
    customerPhone: input.customerPhone,
    shippingAddress: input.shippingAddress.trim(),
    items: orderItems,
    subtotalEgp,
    platformFeeEgp,
    totalEgp,
    status: 'pending',
    createdAt: nowIso(),
  };
  orderMap[input.shopId] = [order, ...(orderMap[input.shopId] ?? [])];
  await writeOrderMap(orderMap);
  await pushOwnerNotification({
    shopId: order.shopId,
    kind: 'parts_order',
    customerPhone: order.customerPhone,
    orderId: order.id,
    totalEgp: order.totalEgp,
    partsCount: order.items.reduce((sum, line) => sum + line.qty, 0),
  });
  const partsCount = order.items.reduce((sum, line) => sum + line.qty, 0);
  await sendShopPushForPartsOrder({
    shopId: order.shopId,
    customerPhone: order.customerPhone,
    partsCount,
    totalEn: formatEgp(order.totalEgp, 'en'),
    totalAr: formatEgp(order.totalEgp, 'ar'),
    orderId: order.id,
  });
  await createCustomerInvoiceFromPartsOrder({
    customerId: input.customerId,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    order,
  });
  return { order };
}
