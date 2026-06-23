import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createCustomerInvoiceFromPartsOrder,
  pushOwnerNotification,
  updateCustomerInvoiceOrderStatus,
} from '@/lib/booking/commerceEvents';
import { DEMO_SHOPS } from '@/lib/booking/demoShops';
import { formatEgp } from '@/lib/booking/reporting';
import type { PartsOrder, PartsOrderItem, PartsOrderStatus, SparePartItem } from '@/lib/booking/types';
import { sendShopPushForPartsOrder } from '@/lib/push/shopPush';

const INVENTORY_KEY = '@pitstop/parts-inventory/v1';
const ORDERS_KEY = '@pitstop/parts-orders/v1';
const PLATFORM_FEE_RATE = 0.08;

type InventoryMap = Record<string, SparePartItem[]>;
type OrderMap = Record<string, PartsOrder[]>;

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSeedForShop(shopId: string): SparePartItem[] {
  const ts = nowIso();
  return [
    {
      id: id('part'),
      shopId,
      name: 'Engine Oil 5W-30',
      priceEgp: 450,
      stockQty: 12,
      imageUrl:
        'https://images.unsplash.com/photo-1545060894-4f8e5f343ee8?auto=format&fit=crop&w=600&q=60',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: id('part'),
      shopId,
      name: 'Brake Pads Front',
      priceEgp: 780,
      stockQty: 8,
      imageUrl:
        'https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=600&q=60',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: id('part'),
      shopId,
      name: 'Air Filter',
      priceEgp: 220,
      stockQty: 16,
      imageUrl:
        'https://images.unsplash.com/photo-1635776062124-d379bfcba9f0?auto=format&fit=crop&w=600&q=60',
      createdAt: ts,
      updatedAt: ts,
    },
  ];
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

async function ensureSeededInventory(map: InventoryMap): Promise<InventoryMap> {
  let changed = false;
  for (const shop of DEMO_SHOPS) {
    if (shop.type !== 'parts') continue;
    if (!Array.isArray(map[shop.id]) || map[shop.id].length === 0) {
      map[shop.id] = defaultSeedForShop(shop.id);
      changed = true;
    }
  }
  if (changed) await writeInventoryMap(map);
  return map;
}

export async function listInventoryForShop(shopId: string): Promise<SparePartItem[]> {
  const map = await ensureSeededInventory(await readInventoryMap());
  const rows = map[shopId] ?? [];
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function addInventoryItem(
  shopId: string,
  input: { name: string; priceEgp: number; stockQty: number; imageUrl?: string },
): Promise<SparePartItem> {
  const map = await ensureSeededInventory(await readInventoryMap());
  const ts = nowIso();
  const row: SparePartItem = {
    id: id('part'),
    shopId,
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
  partId: string,
  delta: number,
): Promise<SparePartItem | null> {
  const map = await ensureSeededInventory(await readInventoryMap());
  const rows = map[shopId] ?? [];
  const idx = rows.findIndex((r) => r.id === partId);
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
  customerId?: string;
  customerEmail?: string;
  customerPhone: string;
  shippingAddress: string;
  items: Array<{ partId: string; qty: number }>;
}): Promise<{ order?: PartsOrder; error?: string }> {
  const inventoryMap = await ensureSeededInventory(await readInventoryMap());
  const shopRows = inventoryMap[input.shopId] ?? [];
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

  // Decrement inventory stock.
  const nextRows = shopRows.map((row) => {
    const line = orderItems.find((x) => x.partId === row.id);
    if (!line) return row;
    return {
      ...row,
      stockQty: Math.max(0, row.stockQty - line.qty),
      updatedAt: nowIso(),
    };
  });
  inventoryMap[input.shopId] = nextRows;
  await writeInventoryMap(inventoryMap);

  // Save order.
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
