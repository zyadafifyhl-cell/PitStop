import type { ShopType, StoreCategory } from '@/lib/booking/types';

export function isStoreShopType(type: ShopType): boolean {
  return type === 'parts' || type === 'accessories';
}

export function storeCategoryForShopType(type: ShopType): StoreCategory | null {
  if (type === 'parts') return 'parts';
  if (type === 'accessories') return 'accessories';
  return null;
}
