import type { StoreCartItem, StoreProduct } from '@/lib/store/types';
import { getSupabase } from '@/lib/supabase/client';

type CartRow = {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

type ProductJoinRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  sub_category: string;
  price: number | string;
  sale_price?: number | string | null;
  stock_quantity: number;
  image_url: string | null;
  compatibility_type: string;
  rating: number | string;
  rating_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CartRowWithProduct = CartRow & {
  products: ProductJoinRow | null;
};

function mapJoinedProduct(row: ProductJoinRow): StoreProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category as StoreProduct['category'],
    subCategory: row.sub_category,
    price: Number(row.price),
    salePrice: row.sale_price != null ? Number(row.sale_price) : undefined,
    stockQuantity: row.stock_quantity,
    imageUrl: row.image_url ?? undefined,
    compatibilityType: row.compatibility_type as StoreProduct['compatibilityType'],
    rating: Number(row.rating),
    ratingCount: row.rating_count,
    isActive: row.is_active,
    compatibility: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCartRow(row: CartRow, product?: StoreProduct): StoreCartItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    quantity: row.quantity,
    product,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCartItemsForUser(userId: string): Promise<StoreCartItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('cart_items')
    .select('*, products(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    console.warn('listCartItemsForUser:', error?.message);
    return [];
  }

  return (data as CartRowWithProduct[]).map((row) =>
    mapCartRow(row, row.products ? mapJoinedProduct(row.products) : undefined),
  );
}

export async function upsertCartItem(userId: string, productId: string, quantity: number): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || quantity < 1) return false;

  const { error } = await supabase.from('cart_items').upsert(
    {
      user_id: userId,
      product_id: productId,
      quantity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,product_id' },
  );

  if (error) {
    console.warn('upsertCartItem:', error.message);
    return false;
  }
  return true;
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('user_id', userId);

  return !error;
}

export async function removeCartItemByProductId(userId: string, productId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId);

  return !error;
}

export async function clearCartForUser(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.from('cart_items').delete().eq('user_id', userId);
  return !error;
}

export function cartItemCount(items: StoreCartItem[]): number {
  return items.reduce((sum, row) => sum + row.quantity, 0);
}

export function cartSubtotal(items: StoreCartItem[]): number {
  return items.reduce((sum, row) => sum + (row.product?.price ?? 0) * row.quantity, 0);
}
