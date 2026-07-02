import type { ShopOffer } from '@/lib/booking/types';

export const PLATFORM_FEE_RATE = 0.12;

export function roundEgp(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

export function normalizeOfferDiscount(raw?: number | null): number {
  if (raw == null || Number.isNaN(Number(raw))) return 0;
  return Math.min(100, Math.max(0, Number(raw)));
}

export function applyOfferDiscount(basePrice: number, discountPercentage: number): number {
  const pct = normalizeOfferDiscount(discountPercentage);
  return roundEgp(basePrice * (1 - pct / 100));
}

export function computePlatformFee(discountedPrice: number, rate = PLATFORM_FEE_RATE): number {
  return roundEgp(discountedPrice * rate);
}

export function offerWindowStart(offer: Pick<ShopOffer, 'startDate' | 'createdAt' | 'validUntil'>): number {
  const raw = offer.startDate || offer.createdAt || offer.validUntil;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function offerWindowEnd(offer: Pick<ShopOffer, 'endDate' | 'validUntil'>): number {
  const raw = offer.endDate || offer.validUntil;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function isOfferLive(
  offer: Pick<ShopOffer, 'active' | 'startDate' | 'endDate' | 'validUntil' | 'createdAt'>,
  now = Date.now(),
): boolean {
  if (!offer.active) return false;
  const start = offerWindowStart(offer);
  const end = offerWindowEnd(offer);
  if (!start || !end) return false;
  return now >= start && now <= end;
}

export function pickBestLiveOffer(offers: ShopOffer[]): ShopOffer | undefined {
  return offers
    .filter((offer) => isOfferLive(offer))
    .sort((a, b) => normalizeOfferDiscount(b.discountPercentage) - normalizeOfferDiscount(a.discountPercentage))[0];
}
