import {
  fetchShopByIdRemote,
  getShopById,
  hydrateCatalogCache,
} from '@/lib/booking/catalogRepository';
import { computeShopRatingSummary, getCustomerShopReview, listShopReviews } from '@/lib/booking/reviewsStorage';
import { getShopExtras, getShopExtrasCached } from '@/lib/booking/shopExtrasStorage';
import type { Shop, ShopExtras, ShopReview, ShopType } from '@/lib/booking/types';
import {
  fetchBranchProfile,
  fetchDefaultBranchCoordinates,
  fetchDefaultBranchProfile,
  fetchVisibleServicesForShop,
} from '@/lib/booking/wash/branchRepository';
import type { WashBranch } from '@/lib/booking/wash/types';
import { mergeWashBranchIntoExtras } from '@/lib/booking/wash/washSync';

export type ShopProfileCoords = { latitude: number; longitude: number };

export type ShopProfileBootstrap = {
  shop: Shop | null;
  extras: ShopExtras;
  branchCoords: ShopProfileCoords | null;
};

export type ShopProfileRemoteSnapshot = ShopProfileBootstrap & {
  reviews: ShopReview[];
  averageRating: number | null;
  reviewCount: number;
  customerReview: ShopReview | null;
};

export function shopExtrasFingerprint(extras: ShopExtras): string {
  return JSON.stringify({
    profileName: extras.profileName,
    profileNameAr: extras.profileNameAr,
    profileAddress: extras.profileAddress,
    profileAddressAr: extras.profileAddressAr,
    profilePhone: extras.profilePhone,
    profileEmail: extras.profileEmail,
    moreInfo: extras.moreInfo,
    moreInfoAr: extras.moreInfoAr,
    profileImageUrl: extras.profileImageUrl,
    imageUrls: extras.imageUrls,
    servicePriceEgp: extras.servicePriceEgp,
    workOpenTime: extras.workOpenTime,
    workCloseTime: extras.workCloseTime,
    serviceDurationMinutes: extras.serviceDurationMinutes,
    weeklyHours: extras.weeklyHours,
    services: extras.services,
    offers: extras.offers,
    washShopStatus: extras.washShopStatus,
    vacationReturnDate: extras.vacationReturnDate,
    vacationMessage: extras.vacationMessage,
    vacationMessageAr: extras.vacationMessageAr,
    winchEnabled: extras.winchEnabled,
    winchPhone: extras.winchPhone,
    activeBranchId: extras.activeBranchId,
  });
}

function coordsFromShop(shop: Shop | null | undefined): ShopProfileCoords | null {
  if (!shop || !Number.isFinite(shop.latitude) || !Number.isFinite(shop.longitude)) return null;
  return { latitude: shop.latitude, longitude: shop.longitude };
}

function isRetailShop(type?: ShopType): boolean {
  return type === 'parts' || type === 'accessories';
}

function visibleCustomerServices(extras: ShopExtras): ShopExtras['services'] {
  return (extras.services ?? []).filter(
    (service) => service.active !== false && service.visible !== false,
  );
}

/**
 * Overlay the live branch_services menu onto extras.
 * Customer sessions cannot persist extras, so shop_extras.payload.services is often stale/empty.
 */
export async function overlayBranchServicesOnExtras(
  shopId: string,
  extras: ShopExtras,
  options?: { shopType?: ShopType; branch?: WashBranch | null },
): Promise<ShopExtras> {
  if (!shopId || isRetailShop(options?.shopType)) return extras;

  const resolvedBranch =
    options && 'branch' in options
      ? options.branch ?? null
      : extras.activeBranchId?.trim()
        ? await fetchBranchProfile(shopId, extras.activeBranchId.trim())
        : await fetchDefaultBranchProfile(shopId);

  const merged = resolvedBranch ? mergeWashBranchIntoExtras(extras, resolvedBranch) : extras;
  const visible = visibleCustomerServices(merged);
  if (visible.length) return { ...merged, services: visible };

  const fallback = await fetchVisibleServicesForShop(shopId, resolvedBranch?.id);
  if (!fallback.length) return { ...merged, services: visible };
  return { ...merged, services: fallback };
}

/** Instant offline-first bootstrap from catalog + local extras cache. */
export async function bootstrapShopProfileFromCache(shopId: string): Promise<ShopProfileBootstrap> {
  await hydrateCatalogCache();
  const shop = getShopById(shopId) ?? null;
  const extras = await getShopExtrasCached(shopId);
  return {
    shop,
    extras,
    branchCoords: coordsFromShop(shop),
  };
}

/** Full remote refresh for background reconciliation. */
export async function fetchShopProfileRemote(
  shopId: string,
  customerId?: string,
): Promise<ShopProfileRemoteSnapshot> {
  await hydrateCatalogCache();

  let shop = getShopById(shopId) ?? null;
  if (!shop) {
    shop = await fetchShopByIdRemote(shopId);
  }
  const resolvedShopId = shop?.id ?? shopId;

  let washBranch: WashBranch | null = null;
  let syncedBranchCoords: ShopProfileCoords | null = null;
  if (shop && !isRetailShop(shop.type)) {
    const currentExtras = await getShopExtrasCached(resolvedShopId);
    const activeBranchId = currentExtras.activeBranchId?.trim();
    washBranch = activeBranchId
      ? await fetchBranchProfile(shop.id, activeBranchId)
      : await fetchDefaultBranchProfile(shop.id);
    if (washBranch?.latitude != null && washBranch?.longitude != null) {
      syncedBranchCoords = { latitude: washBranch.latitude, longitude: washBranch.longitude };
    }
  }

  const [extrasRaw, reviewRows, coords, customerReview] = await Promise.all([
    getShopExtras(resolvedShopId),
    listShopReviews(resolvedShopId),
    syncedBranchCoords ? Promise.resolve(syncedBranchCoords) : fetchDefaultBranchCoordinates(resolvedShopId),
    customerId ? getCustomerShopReview(resolvedShopId, customerId) : Promise.resolve(null),
  ]);

  const extras = await overlayBranchServicesOnExtras(resolvedShopId, extrasRaw, {
    shopType: shop?.type,
    branch: washBranch,
  });

  const summary = computeShopRatingSummary(reviewRows);
  const visibleRemote = reviewRows.filter((review) => !review.hidden);

  return {
    shop,
    extras,
    branchCoords: coords ?? coordsFromShop(shop),
    reviews: visibleRemote,
    averageRating: summary.average,
    reviewCount: summary.count,
    customerReview,
  };
}
