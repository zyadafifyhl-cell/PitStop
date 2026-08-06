import type { StoreProduct } from '@/lib/store/types';

export function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyPercentDiscount(price: number, percent: number): number {
  const safePercent = clampDiscountPercent(percent);
  if (safePercent <= 0) return price;
  const discounted = price * (1 - safePercent / 100);
  return Math.max(0, Math.round(discounted * 100) / 100);
}

/** Effective customer price: product sale price beats global store discount. */
export function resolveStoreProductEffectivePrice(
  product: Pick<StoreProduct, 'price' | 'salePrice'>,
  globalDiscountPercent = 0,
): number {
  const base = product.price;
  if (product.salePrice != null && product.salePrice >= 0 && product.salePrice < base) {
    return product.salePrice;
  }
  return applyPercentDiscount(base, globalDiscountPercent);
}

export function hasStoreProductDiscount(
  product: Pick<StoreProduct, 'price' | 'salePrice'>,
  globalDiscountPercent = 0,
): boolean {
  return resolveStoreProductEffectivePrice(product, globalDiscountPercent) < product.price;
}
