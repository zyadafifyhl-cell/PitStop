import { MAX_STORE_PRODUCT_IMAGES } from '@/lib/store/constants';
import type { StoreProduct } from '@/lib/store/types';

export function normalizeProductImageUrls(
  imageUrls?: string[] | null,
  imageUrl?: string | null,
): string[] {
  const fromArray = (imageUrls ?? []).map((url) => url.trim()).filter(Boolean);
  if (fromArray.length) return fromArray.slice(0, MAX_STORE_PRODUCT_IMAGES);
  const fallback = imageUrl?.trim();
  return fallback ? [fallback] : [];
}

export function primaryProductImageUrl(
  product: Pick<StoreProduct, 'imageUrl' | 'imageUrls'>,
): string | undefined {
  return normalizeProductImageUrls(product.imageUrls, product.imageUrl)[0];
}
