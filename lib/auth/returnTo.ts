import type { Href } from 'expo-router';

const ALLOWED_RETURN = /^\/(book|parts-shop|shop-profile)\/[A-Za-z0-9-]+(\?[^#]*)?$/;

export function buildBookReturnTo(shopId: string, serviceIds?: string[]): string {
  const base = `/book/${shopId}`;
  const params = new URLSearchParams();
  if (serviceIds?.length) params.set('serviceIds', serviceIds.join(','));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** @deprecated Use buildBookReturnTo with serviceIds array */
export function buildBookReturnToLegacy(shopId: string, serviceId?: string): string {
  return buildBookReturnTo(shopId, serviceId ? [serviceId] : undefined);
}

export function buildPartsReturnTo(shopId: string): string {
  return `/parts-shop/${shopId}`;
}

export function buildShopProfileReturnTo(shopId: string): string {
  return `/shop-profile/${shopId}`;
}

export function resolveReturnTo(raw?: string | string[]): Href | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !ALLOWED_RETURN.test(value)) return null;
  return value as Href;
}
