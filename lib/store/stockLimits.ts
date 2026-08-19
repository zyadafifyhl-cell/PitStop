import type { StoreCartItem, StoreProduct } from '@/lib/store/types';

export function availableStock(product?: Pick<StoreProduct, 'stockQuantity'> | null): number {
  return Math.max(0, Math.floor(Number(product?.stockQuantity ?? 0)));
}

/** Cap increases / typed values to live stock, but still allow stepping down from a stale oversell. */
export function clampRequestedCartQuantity(input: {
  requested: number;
  current: number;
  stock: number;
}): number {
  const requested = Math.floor(Number(input.requested));
  const current = Math.max(0, Math.floor(Number(input.current)));
  const stock = Math.max(0, Math.floor(Number(input.stock)));
  if (!Number.isFinite(requested) || requested < 1) return 0;
  if (requested <= stock) return requested;
  if (requested < current) return requested;
  return stock > 0 ? stock : current;
}

export function cartItemExceedsStock(item: StoreCartItem): boolean {
  return item.quantity > availableStock(item.product);
}

export function isAtMaxStock(quantity: number, stock: number): boolean {
  return stock > 0 && quantity >= stock;
}

export function isOutOfStock(product?: Pick<StoreProduct, 'stockQuantity'> | null): boolean {
  return availableStock(product) <= 0;
}
