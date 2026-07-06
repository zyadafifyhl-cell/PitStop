import type { OfferType, ShopOffer } from '@/lib/booking/types';

export const PLATFORM_FEE_RATE = 0.12;

export function roundEgp(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

export function normalizeOfferDiscount(raw?: number | null): number {
  if (raw == null || Number.isNaN(Number(raw))) return 0;
  return Math.min(100, Math.max(0, Number(raw)));
}

export function resolveOfferType(offer: Pick<ShopOffer, 'offerType' | 'discountPercentage'>): OfferType {
  if (offer.offerType) return offer.offerType;
  return 'percentage';
}

export function resolveOfferDiscountValue(offer: Pick<ShopOffer, 'offerType' | 'discountValue' | 'discountPercentage'>): number {
  if (offer.discountValue > 0) return offer.discountValue;
  return normalizeOfferDiscount(offer.discountPercentage);
}

export function resolveBogoQuantities(
  offer: Pick<ShopOffer, 'offerType' | 'buyQuantity' | 'getFreeQuantity'>,
): { buyQuantity: number; getFreeQuantity: number; groupSize: number } {
  const buyQuantity = Math.max(1, Math.floor(offer.buyQuantity || 1));
  const getFreeQuantity = Math.max(1, Math.floor(offer.getFreeQuantity || 1));
  return {
    buyQuantity,
    getFreeQuantity,
    groupSize: buyQuantity + getFreeQuantity,
  };
}

export type CartLineItem = {
  serviceId: string;
  unitPriceEgp: number;
  quantity: number;
};

export type BogoPricingResult = {
  originalEgp: number;
  discountedEgp: number;
  savingsEgp: number;
  freeUnits: number;
  paidUnits: number;
  applied: boolean;
  groupSize: number;
  buyQuantity: number;
  getFreeQuantity: number;
  nudgeNeeded: boolean;
  /** Free units earned per service id in the cart. */
  lineFreeUnits: Record<string, number>;
};

/** Same-cart BOGO: groupSize = buy + free; G = floor(Q/groupSize); free = G * getFree. */
export function computeBogoCartPrice(lineItems: CartLineItem[], offer: ShopOffer): BogoPricingResult {
  const { buyQuantity, getFreeQuantity, groupSize } = resolveBogoQuantities(offer);

  const byService = new Map<string, { unitPriceEgp: number; quantity: number }>();
  for (const item of lineItems) {
    if (item.quantity <= 0) continue;
    const existing = byService.get(item.serviceId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      byService.set(item.serviceId, { unitPriceEgp: item.unitPriceEgp, quantity: item.quantity });
    }
  }

  let originalEgp = 0;
  let discountedEgp = 0;
  let totalFreeUnits = 0;
  let totalPaidUnits = 0;
  let anyApplied = false;
  let anyNudge = false;
  const lineFreeUnits: Record<string, number> = {};

  for (const [serviceId, { unitPriceEgp, quantity: Q }] of byService) {
    originalEgp += Q * unitPriceEgp;
    const completeGroups = Math.floor(Q / groupSize);
    const freeUnits = completeGroups * getFreeQuantity;
    const paidUnits = Q - freeUnits;
    discountedEgp += paidUnits * unitPriceEgp;
    totalFreeUnits += freeUnits;
    totalPaidUnits += paidUnits;

    if (freeUnits > 0) {
      anyApplied = true;
      lineFreeUnits[serviceId] = freeUnits;
    }
    if (Q > 0 && Q < groupSize) {
      anyNudge = true;
    }
  }

  originalEgp = roundEgp(originalEgp);
  discountedEgp = roundEgp(discountedEgp);

  return {
    originalEgp,
    discountedEgp,
    savingsEgp: roundEgp(originalEgp - discountedEgp),
    freeUnits: totalFreeUnits,
    paidUnits: totalPaidUnits,
    applied: anyApplied,
    groupSize,
    buyQuantity,
    getFreeQuantity,
    nudgeNeeded: anyNudge && !anyApplied,
    lineFreeUnits,
  };
}

export function applyOfferDiscount(basePrice: number, discountPercentage: number): number {
  const pct = normalizeOfferDiscount(discountPercentage);
  return roundEgp(basePrice * (1 - pct / 100));
}

/** Applies percentage, flat amount, stamp-card buy-X-get-Y, or same-cart BOGO pricing. */
export function applyCampaignPrice(
  basePrice: number,
  offer: ShopOffer,
  doneBookingCount = 0,
  cartLineItems?: CartLineItem[],
): number {
  const type = resolveOfferType(offer);
  const value = resolveOfferDiscountValue(offer);

  if (type === 'percentage') {
    return applyOfferDiscount(basePrice, value);
  }
  if (type === 'flat_amount') {
    return roundEgp(Math.max(0, basePrice - value));
  }
  if (type === 'buy_x_get_y') {
    const cycle = Math.max(1, offer.requiredWashCount) + 1;
    return (doneBookingCount + 1) % cycle === 0 ? 0 : basePrice;
  }
  if (type === 'bogo' && cartLineItems?.length) {
    return computeBogoCartPrice(cartLineItems, offer).discountedEgp;
  }
  return basePrice;
}

export function isBuyXGetYFreeNext(offer: ShopOffer, doneBookingCount: number): boolean {
  if (resolveOfferType(offer) !== 'buy_x_get_y') return false;
  const cycle = Math.max(1, offer.requiredWashCount) + 1;
  return (doneBookingCount + 1) % cycle === 0;
}

export type OfferBadgeMessages = { pct: string; flat: string; buyX: string; bogo: string };

export function buildOfferBadgeMessages(
  t: (key: 'offer_badge_pct' | 'offer_badge_flat' | 'offer_badge_buy_x' | 'offer_badge_bogo') => string,
): OfferBadgeMessages {
  return {
    pct: t('offer_badge_pct'),
    flat: t('offer_badge_flat'),
    buyX: t('offer_badge_buy_x'),
    bogo: t('offer_badge_bogo'),
  };
}

export function formatOfferBadge(
  offer: ShopOffer,
  messages: OfferBadgeMessages,
): string {
  const type = resolveOfferType(offer);
  const value = resolveOfferDiscountValue(offer);

  if (type === 'percentage' && value > 0) {
    return messages.pct.replace('{pct}', String(Math.round(value)));
  }
  if (type === 'flat_amount' && value > 0) {
    return messages.flat.replace('{amount}', String(Math.round(value)));
  }
  if (type === 'buy_x_get_y') {
    const count = Math.max(1, offer.requiredWashCount);
    return messages.buyX.replace('{count}', String(count));
  }
  if (type === 'bogo') {
    const { buyQuantity, getFreeQuantity } = resolveBogoQuantities(offer);
    return messages.bogo
      .replace('{buy}', String(buyQuantity))
      .replace('{free}', String(getFreeQuantity));
  }
  return offer.title;
}

export function computePlatformFee(discountedPrice: number, rate = PLATFORM_FEE_RATE): number {
  return roundEgp(discountedPrice * rate);
}

export function offerWindowStart(offer: Pick<ShopOffer, 'startDate' | 'createdAt' | 'validUntil'>): number {
  const raw = offer.startDate || offer.createdAt || offer.validUntil;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function offerWindowEnd(
  offer: Pick<ShopOffer, 'endDate' | 'validUntil' | 'expiresAt'>,
): number {
  const raw = offer.expiresAt || offer.endDate || offer.validUntil;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

export function isOfferLive(
  offer: Pick<
    ShopOffer,
    'active' | 'startDate' | 'endDate' | 'validUntil' | 'createdAt' | 'expiresAt'
  >,
  now = Date.now(),
): boolean {
  if (!offer.active) return false;
  const start = offerWindowStart(offer);
  const end = offerWindowEnd(offer);
  if (!start) return false;
  return now >= start && now <= end;
}

export function offerSortWeight(offer: ShopOffer): number {
  const type = resolveOfferType(offer);
  const value = resolveOfferDiscountValue(offer);
  if (type === 'bogo') {
    const { buyQuantity, getFreeQuantity } = resolveBogoQuantities(offer);
    return 1100 + buyQuantity * 10 + getFreeQuantity;
  }
  if (type === 'buy_x_get_y') return 1000 + offer.requiredWashCount;
  if (type === 'percentage') return value;
  if (type === 'flat_amount') return value / 10;
  return 0;
}

export function pickBestLiveOffer(offers: ShopOffer[]): ShopOffer | undefined {
  return offers
    .filter((offer) => isOfferLive(offer))
    .sort((a, b) => offerSortWeight(b) - offerSortWeight(a))[0];
}

/** Build cart line items from a flat list of selected service ids (each id = qty 1). */
export function buildCartLineItemsFromServiceIds(
  selectedServiceIds: string[],
  priceByServiceId: Record<string, number>,
): CartLineItem[] {
  const counts = new Map<string, number>();
  for (const id of selectedServiceIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([serviceId, quantity]) => ({
    serviceId,
    unitPriceEgp: priceByServiceId[serviceId] ?? 0,
    quantity,
  }));
}
