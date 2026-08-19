import type {
  CustomerStoreOrder,
  StoreCompatibilityType,
  StoreFulfillmentMethod,
  StoreOrder,
  StoreOrderItem,
  StoreOrderStatus,
  StoreProduct,
  StoreProductCategory,
  StoreProductCompatibility,
  StoreProductDraft,
} from '@/lib/store/types';
import { normalizeProductImageUrls } from '@/lib/store/productImages';
import { getSupabase } from '@/lib/supabase/client';

type ProductRow = {
  id: string;
  shop_id?: string | null;
  name: string;
  description: string | null;
  category: StoreProductCategory;
  sub_category: string;
  price: number | string;
  sale_price?: number | string | null;
  stock_quantity: number;
  image_url: string | null;
  image_urls?: string[] | null;
  compatibility_type: StoreCompatibilityType;
  rating: number | string;
  rating_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_compatibility?: CompatibilityRow[];
};

type CompatibilityRow = {
  id: string;
  product_id: string;
  brand: string | null;
  model: string | null;
  year_start: number | null;
  year_end: number | null;
};

function mapCompatibility(row: CompatibilityRow): StoreProductCompatibility {
  return {
    id: row.id,
    productId: row.product_id,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    yearStart: row.year_start ?? undefined,
    yearEnd: row.year_end ?? undefined,
  };
}

function mapProduct(row: ProductRow): StoreProduct {
  const imageUrls = normalizeProductImageUrls(row.image_urls, row.image_url);
  return {
    id: row.id,
    shopId: row.shop_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category,
    subCategory: row.sub_category,
    price: Number(row.price),
    salePrice: row.sale_price != null ? Number(row.sale_price) : undefined,
    stockQuantity: row.stock_quantity,
    imageUrl: imageUrls[0],
    imageUrls,
    compatibilityType: row.compatibility_type,
    rating: Number(row.rating),
    ratingCount: row.rating_count,
    isActive: row.is_active,
    compatibility: (row.product_compatibility ?? []).map(mapCompatibility),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listStoreProducts(options?: { includeInactive?: boolean }): Promise<StoreProduct[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from('products')
    .select('*, product_compatibility(*)')
    .order('created_at', { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.warn('listStoreProducts:', error?.message);
    return [];
  }

  return (data as ProductRow[]).map(mapProduct);
}

export async function getStoreProductById(productId: string): Promise<StoreProduct | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('products')
    .select('*, product_compatibility(*)')
    .eq('id', productId)
    .maybeSingle();

  if (error || !data) return null;
  return mapProduct(data as ProductRow);
}

export async function createStoreProduct(draft: StoreProductDraft): Promise<StoreProduct | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: productRow, error } = await supabase
    .from('products')
    .insert({
      name: draft.name.trim(),
      shop_id: draft.shopId ?? null,
      description: draft.description?.trim() || null,
      category: draft.category,
      sub_category: draft.subCategory,
      price: draft.price,
      stock_quantity: draft.stockQuantity,
      image_url: draft.imageUrl?.trim() || draft.imageUrls?.[0] || null,
      image_urls: draft.imageUrls?.length ? draft.imageUrls : undefined,
      compatibility_type: draft.compatibilityType,
    })
    .select('*')
    .single();

  if (error || !productRow) {
    console.warn('createStoreProduct:', error?.message);
    return null;
  }

  if (draft.compatibilityType !== 'universal' && draft.compatibilityRows.length) {
    const { error: compatError } = await supabase.from('product_compatibility').insert(
      draft.compatibilityRows.map((row) => ({
        product_id: productRow.id,
        brand: row.brand?.trim() || null,
        model: row.model?.trim() || null,
        year_start: row.yearStart ?? null,
        year_end: row.yearEnd ?? null,
      })),
    );
    if (compatError) {
      console.warn('createStoreProduct compatibility:', compatError.message);
    }
  }

  return getStoreProductById(productRow.id);
}

export async function listStoreProductsByCategory(
  category: StoreProductCategory,
  options?: { includeInactive?: boolean },
): Promise<StoreProduct[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from('products')
    .select('*, product_compatibility(*)')
    .eq('category', category)
    .order('created_at', { ascending: false });

  if (!options?.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.warn('listStoreProductsByCategory:', error?.message);
    return [];
  }

  return (data as ProductRow[]).map(mapProduct);
}

export async function listStoreProductsByShop(
  shopId: string,
  options?: { includeInactive?: boolean },
): Promise<StoreProduct[]> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return [];

  let query = supabase
    .from('products')
    .select('*, product_compatibility(*)')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (!options?.includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error || !data) {
    console.warn('listStoreProductsByShop:', error?.message);
    return [];
  }

  return (data as ProductRow[]).map(mapProduct);
}

export async function updateStoreProductFields(
  productId: string,
  patch: {
    price?: number;
    salePrice?: number | null;
    stockQuantity?: number;
    isActive?: boolean;
  },
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.price != null) payload.price = patch.price;
  if (patch.salePrice !== undefined) payload.sale_price = patch.salePrice;
  if (patch.stockQuantity != null) payload.stock_quantity = patch.stockQuantity;
  if (patch.isActive != null) payload.is_active = patch.isActive;

  const { error } = await supabase.from('products').update(payload).eq('id', productId);
  return !error;
}

export async function updateStoreProductStock(productId: string, stockQuantity: number): Promise<boolean> {
  return updateStoreProductFields(productId, { stockQuantity });
}

export async function setStoreProductActive(productId: string, isActive: boolean): Promise<boolean> {
  return updateStoreProductFields(productId, { isActive });
}

export async function deleteStoreProduct(productId: string, shopId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return false;
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('shop_id', shopId);
  if (error) console.warn('deleteStoreProduct:', error.message);
  return !error;
}

type OrderRow = {
  id: string;
  user_id: string;
  shop_id?: string | null;
  subtotal: number | string;
  delivery_fee: number | string;
  total_price: number | string;
  fulfillment_method: StoreFulfillmentMethod;
  status: StoreOrderStatus;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  delivery_notes?: string | null;
  created_at: string;
  updated_at: string;
  shops?: {
    name?: string | null;
    name_ar?: string | null;
    phone?: string | null;
    address?: string | null;
    address_ar?: string | null;
  } | null;
  store_order_items?: OrderItemRow[];
  items?: OrderItemRow[];
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
  products?: { image_url?: string | null; image_urls?: string[] | null } | null;
};

function mapOrder(row: OrderRow): StoreOrder {
  return {
    id: row.id,
    userId: row.user_id,
    shopId: row.shop_id ?? undefined,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    totalPrice: Number(row.total_price),
    fulfillmentMethod: row.fulfillment_method,
    status: row.status,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryNotes: row.delivery_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderItem(row: OrderItemRow): StoreOrderItem {
  const imageUrls = normalizeProductImageUrls(row.products?.image_urls, row.products?.image_url);
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id ?? undefined,
    productName: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    lineTotal: Number(row.line_total),
    productImageUrl: imageUrls[0],
  };
}

function mapCustomerOrder(row: OrderRow): CustomerStoreOrder {
  const items = (row.store_order_items ?? row.items ?? []).map(mapOrderItem);
  return {
    ...mapOrder(row),
    shopName: row.shops?.name ?? undefined,
    shopNameAr: row.shops?.name_ar ?? undefined,
    shopPhone: row.shops?.phone ?? undefined,
    shopAddress: row.shops?.address ?? undefined,
    shopAddressAr: row.shops?.address_ar ?? undefined,
    items,
  };
}

export class StoreOrderError extends Error {
  readonly code: 'insufficient_stock' | 'generic';

  constructor(code: 'insufficient_stock' | 'generic', message: string) {
    super(message);
    this.name = 'StoreOrderError';
    this.code = code;
  }
}

export function isInsufficientStockError(error: unknown): boolean {
  if (error instanceof StoreOrderError) return error.code === 'insufficient_stock';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /insufficient stock/i.test(message);
}

export async function placeStoreOrder(input: {
  fulfillmentMethod: StoreFulfillmentMethod;
  deliveryFee: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  shopId?: string;
}): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) throw new StoreOrderError('generic', 'Supabase is not configured');

  const { data, error } = await supabase.rpc('place_store_order', {
    p_fulfillment_method: input.fulfillmentMethod,
    p_delivery_fee: input.deliveryFee,
    p_customer_name: input.customerName?.trim() || null,
    p_customer_phone: input.customerPhone?.trim() || null,
    p_delivery_address: input.deliveryAddress?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_shop_id: input.shopId?.trim() || null,
  });

  if (error) {
    console.error('placeStoreOrder:', error);
    if (/insufficient stock/i.test(error.message ?? '')) {
      throw new StoreOrderError('insufficient_stock', error.message);
    }
    throw new StoreOrderError('generic', error.message || 'Could not place order');
  }

  return typeof data === 'string' ? data : null;
}

export async function listStoreOrdersForAdmin(): Promise<StoreOrder[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('store_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
}

export async function listStoreOrdersForUser(userId: string): Promise<CustomerStoreOrder[]> {
  const supabase = getSupabase();
  if (!supabase || !userId) return [];

  const withShopJoin = await supabase
    .from('store_orders')
    .select(
      `
      *,
      shops ( name, name_ar, phone, address, address_ar ),
      store_order_items (
        *,
        products ( image_url, image_urls )
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!withShopJoin.error && withShopJoin.data) {
    return (withShopJoin.data as OrderRow[]).map(mapCustomerOrder);
  }

  const fallback = await supabase
    .from('store_orders')
    .select(
      `
      *,
      store_order_items (
        *,
        products ( image_url, image_urls )
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (fallback.error || !fallback.data) {
    console.warn('listStoreOrdersForUser:', withShopJoin.error?.message ?? fallback.error?.message);
    return [];
  }
  return (fallback.data as OrderRow[]).map(mapCustomerOrder);
}

export async function cancelOwnStoreOrder(orderId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.rpc('cancel_own_store_order', {
    p_order_id: orderId,
  });

  if (error) {
    console.error('cancelOwnStoreOrder:', error.message);
    return false;
  }
  return true;
}

export async function updateStoreOrderStatus(orderId: string, status: StoreOrderStatus): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('store_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return !error;
}

export async function listStoreOrderItems(orderId: string): Promise<StoreOrderItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('store_order_items')
    .select('*')
    .eq('order_id', orderId);

  if (error || !data) return [];
  return (data as OrderItemRow[]).map(mapOrderItem);
}
