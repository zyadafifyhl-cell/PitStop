import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CustomerInvoice,
  OwnerNotification,
  OwnerNotificationKind,
  PartsOrder,
  PartsOrderItem,
  PartsOrderStatus,
  ShopType,
} from '@/lib/booking/types';

const OWNER_NOTIFICATIONS_KEY = '@pitstop/owner-notifications/v1';
const CUSTOMER_INVOICES_KEY = '@pitstop/customer-invoices/v1';

type OwnerMap = Record<string, OwnerNotification[]>;
type InvoiceMap = Record<string, CustomerInvoice[]>;

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function customerBucket(customerId: string | undefined, customerPhone: string): string {
  if (customerId?.trim()) return `id:${customerId.trim()}`;
  return `phone:${customerPhone.trim()}`;
}

async function readOwnerMap(): Promise<OwnerMap> {
  try {
    const raw = await AsyncStorage.getItem(OWNER_NOTIFICATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as OwnerMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeOwnerMap(map: OwnerMap): Promise<void> {
  await AsyncStorage.setItem(OWNER_NOTIFICATIONS_KEY, JSON.stringify(map));
}

async function readInvoiceMap(): Promise<InvoiceMap> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOMER_INVOICES_KEY);
    const parsed = raw ? (JSON.parse(raw) as InvoiceMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeInvoiceMap(map: InvoiceMap): Promise<void> {
  await AsyncStorage.setItem(CUSTOMER_INVOICES_KEY, JSON.stringify(map));
}

export async function pushOwnerNotification(input: {
  shopId: string;
  kind: OwnerNotificationKind;
  customerPhone: string;
  bookingId?: string;
  orderId?: string;
  shopType?: ShopType;
  scheduledAt?: string;
  totalEgp?: number;
  partsCount?: number;
}): Promise<OwnerNotification> {
  const map = await readOwnerMap();
  const row: OwnerNotification = {
    id: id('owner-notif'),
    shopId: input.shopId,
    kind: input.kind,
    createdAt: new Date().toISOString(),
    customerPhone: input.customerPhone,
    bookingId: input.bookingId,
    orderId: input.orderId,
    shopType: input.shopType,
    scheduledAt: input.scheduledAt,
    totalEgp: input.totalEgp,
    partsCount: input.partsCount,
  };
  map[input.shopId] = [row, ...(map[input.shopId] ?? [])];
  await writeOwnerMap(map);
  return row;
}

export async function listOwnerNotificationsForShop(shopId: string): Promise<OwnerNotification[]> {
  const map = await readOwnerMap();
  return (map[shopId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCustomerInvoiceFromPartsOrder(input: {
  customerId?: string;
  customerPhone: string;
  customerEmail?: string;
  order: PartsOrder;
}): Promise<CustomerInvoice> {
  const map = await readInvoiceMap();
  const bucket = customerBucket(input.customerId, input.customerPhone);
  const row: CustomerInvoice = {
    id: id('invoice'),
    customerId: input.customerId,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    orderId: input.order.id,
    shopId: input.order.shopId,
    shippingAddress: input.order.shippingAddress,
    items: input.order.items,
    subtotalEgp: input.order.subtotalEgp,
    platformFeeEgp: input.order.platformFeeEgp,
    totalEgp: input.order.totalEgp,
    status: input.order.status,
    createdAt: input.order.createdAt,
  };
  map[bucket] = [row, ...(map[bucket] ?? [])];
  await writeInvoiceMap(map);
  return row;
}

export async function listCustomerInvoices(input: {
  customerId?: string;
  customerPhone?: string;
}): Promise<CustomerInvoice[]> {
  const map = await readInvoiceMap();
  const rows: CustomerInvoice[] = [];
  if (input.customerId?.trim()) rows.push(...(map[`id:${input.customerId.trim()}`] ?? []));
  if (input.customerPhone?.trim()) rows.push(...(map[`phone:${input.customerPhone.trim()}`] ?? []));

  const dedup = new Map<string, CustomerInvoice>();
  for (const row of rows) {
    dedup.set(row.id, row);
  }
  return Array.from(dedup.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCustomerInvoiceOrderStatus(
  orderId: string,
  status: PartsOrderStatus,
): Promise<void> {
  const map = await readInvoiceMap();
  let changed = false;
  for (const key of Object.keys(map)) {
    const next = map[key].map((row) => {
      if (row.orderId !== orderId) return row;
      changed = true;
      return { ...row, status };
    });
    map[key] = next;
  }
  if (changed) await writeInvoiceMap(map);
}

export async function markCustomerInvoiceEmailed(orderId: string, emailedAtIso: string): Promise<void> {
  const map = await readInvoiceMap();
  let changed = false;
  for (const key of Object.keys(map)) {
    const next = map[key].map((row) => {
      if (row.orderId !== orderId) return row;
      changed = true;
      return { ...row, emailedAt: emailedAtIso };
    });
    map[key] = next;
  }
  if (changed) await writeInvoiceMap(map);
}

export function buildPartsInvoiceEmailBody(input: {
  locale: 'en' | 'ar';
  shopName: string;
  orderId: string;
  shippingAddress: string;
  subtotalText: string;
  feeText: string;
  totalText: string;
  items: PartsOrderItem[];
}): { subject: string; body: string } {
  if (input.locale === 'ar') {
    const itemsLines = input.items
      .map((item) => `- ${item.name} × ${item.qty} = ${item.lineTotalEgp.toFixed(2)} EGP`)
      .join('\n');
    return {
      subject: `فاتورة طلب قطع غيار - ${input.orderId}`,
      body:
        `مرحبًا،\n\n` +
        `تم إنشاء طلب قطع الغيار من ${input.shopName}.\n` +
        `رقم الطلب: ${input.orderId}\n` +
        `عنوان الشحن: ${input.shippingAddress}\n\n` +
        `تفاصيل الطلب:\n${itemsLines}\n\n` +
        `الإجمالي قبل العمولة: ${input.subtotalText}\n` +
        `العمولة: ${input.feeText}\n` +
        `الإجمالي النهائي: ${input.totalText}\n\n` +
        `شكرًا لاستخدام PitStop.`,
    };
  }

  const itemsLines = input.items
    .map((item) => `- ${item.name} x ${item.qty} = ${item.lineTotalEgp.toFixed(2)} EGP`)
    .join('\n');
  return {
    subject: `Spare Parts Invoice - ${input.orderId}`,
    body:
      `Hello,\n\n` +
      `Your spare parts order from ${input.shopName} was created.\n` +
      `Order ID: ${input.orderId}\n` +
      `Shipping address: ${input.shippingAddress}\n\n` +
      `Order details:\n${itemsLines}\n\n` +
      `Subtotal: ${input.subtotalText}\n` +
      `Platform fee: ${input.feeText}\n` +
      `Total: ${input.totalText}\n\n` +
      `Thanks for using PitStop.`,
  };
}
