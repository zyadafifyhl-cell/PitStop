import type { ShopType, StoreCategory } from '@/lib/booking/types';
import type { StoreProductCategory } from '@/lib/store/types';

export function isStoreShopType(type: ShopType): boolean {
  return type === 'parts' || type === 'accessories';
}

/** Any merchant that can run an in-shop retail catalog (including wash/service). */
export function shopSupportsInShopStore(type: ShopType): boolean {
  return (
    type === 'parts' ||
    type === 'accessories' ||
    type === 'wash' ||
    type === 'maintenance' ||
    type === 'winch'
  );
}

/**
 * Maps shop type → products.category enum.
 * Wash / maintenance / winch sell on-shelf accessories (shampoos, microfibers, etc.).
 */
export function storeProductCategoryForShopType(type: ShopType): StoreProductCategory | null {
  if (type === 'parts') return 'spare_parts';
  if (type === 'accessories' || type === 'wash' || type === 'maintenance' || type === 'winch') {
    return 'accessories';
  }
  return null;
}

export function storeCategoryForShopType(type: ShopType): StoreCategory | null {
  if (type === 'parts') return 'parts';
  if (type === 'accessories') return 'accessories';
  return null;
}
