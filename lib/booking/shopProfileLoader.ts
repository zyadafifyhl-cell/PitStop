import {
  fetchShopByIdRemote,
  getShopById,
  hydrateCatalogCache,
} from '@/lib/booking/catalogRepository';
import { computeShopRatingSummary, getCustomerShopReview, listShopReviews } from '@/lib/booking/reviewsStorage';
import { getShopExtras, getShopExtrasCached } from '@/lib/booking/shopExtrasStorage';
import type { Shop, ShopExtras, ShopReview } from '@/lib/booking/types';
import {
  fetchBranchProfile,
  fetchDefaultBranchCoordinates,
  fetchDefaultBranchProfile,
} from '@/lib/booking/wash/branchRepository';
import { syncWashBranchToShopExtras } from '@/lib/booking/wash/washSync';

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

  let syncedBranchCoords: ShopProfileCoords | null = null;
  if (shop?.type === 'wash') {
    const currentExtras = await getShopExtrasCached(shopId);
    const activeBranchId = currentExtras.activeBranchId?.trim();
    const branch = activeBranchId
      ? await fetchBranchProfile(shop.id, activeBranchId)
      : await fetchDefaultBranchProfile(shop.id);
    if (branch) {
      await syncWashBranchToShopExtras(shop.id, branch);
      if (branch.latitude != null && branch.longitude != null) {
        syncedBranchCoords = { latitude: branch.latitude, longitude: branch.longitude };
      }
    }
  }

  const [extras, reviewRows, coords, customerReview] = await Promise.all([
    getShopExtras(shopId),
    listShopReviews(shopId),
    syncedBranchCoords ? Promise.resolve(syncedBranchCoords) : fetchDefaultBranchCoordinates(shopId),
    customerId ? getCustomerShopReview(shopId, customerId) : Promise.resolve(null),
  ]);

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
