import { getShopById } from '@/lib/booking/catalogRepository';
import {
  addShopImage,
  getShopExtras,
  removeShopImage,
  setShopCoverImage,
  setShopProfileImage,
  setShopProfileInfo,
  setShopSchedule,
  setShopServices,
  setShopWeeklyHours,
  setWashShopStatus,
} from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras, ShopService } from '@/lib/booking/types';
import type { WashBranch, WashShopStatus } from '@/lib/booking/wash/types';

/** Map branch owner status → customer extras field (single source of truth). */
export function resolveCustomerWashShopStatus(branch: WashBranch): WashShopStatus {
  if (branch.shopStatus === 'vacation' || branch.vacationMode?.enabled) return 'vacation';
  if (
    branch.shopStatus === 'open' ||
    branch.shopStatus === 'closed' ||
    branch.shopStatus === 'busy' ||
    branch.shopStatus === 'vacation'
  ) {
    return branch.shopStatus;
  }
  return 'open';
}

/** Push wash branch data into shared shop extras for customer-facing screens. */
export async function syncWashBranchToShopExtras(shopId: string, branch: WashBranch): Promise<void> {
  const shop = getShopById(shopId);
  if (!shop || shop.type !== 'wash') return;

  await setShopProfileInfo(shopId, {
    profileName: branch.profileName,
    profileNameAr: branch.profileNameAr,
    profileAddress: branch.profileAddress,
    profileAddressAr: branch.profileAddressAr,
    profilePhone: branch.profilePhone,
    profileEmail: branch.profileEmail,
    moreInfo: branch.moreInfo,
    moreInfoAr: branch.moreInfoAr,
    winchEnabled: false,
  });

  if (branch.profileImageUrl) {
    await setShopProfileImage(shopId, branch.profileImageUrl);
  }

  const extras = await getShopExtras(shopId);
  const cover = branch.imageUrls?.[0];
  const gallery = (branch.imageUrls ?? []).slice(1);
  const keep = new Set(
    [cover, ...gallery, branch.profileImageUrl].filter((url): url is string => !!url && url.trim().length > 0),
  );

  for (const url of extras.imageUrls) {
    if (!keep.has(url)) {
      await removeShopImage(shopId, url);
    }
  }

  if (cover) {
    await setShopCoverImage(shopId, cover);
  }
  for (const url of gallery) {
    if (url !== cover) {
      await addShopImage(shopId, url);
    }
  }

  if (branch.workOpenTime && branch.workCloseTime && branch.serviceDurationMinutes) {
    await setShopSchedule(shopId, {
      workOpenTime: branch.workOpenTime,
      workCloseTime: branch.workCloseTime,
      serviceDurationMinutes: branch.serviceDurationMinutes,
    });
  }

  if (branch.weeklyHours?.length) {
    await setShopWeeklyHours(shopId, branch.weeklyHours);
  }

  const customerServices: ShopService[] = (branch.services ?? [])
    .filter((service) => service.active !== false && service.visible !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  await setShopServices(shopId, customerServices);

  const washShopStatus = resolveCustomerWashShopStatus(branch);
  await setWashShopStatus(shopId, {
    washShopStatus,
    vacationReturnDate: washShopStatus === 'vacation' ? branch.vacationMode.returnDate : undefined,
    vacationMessage: washShopStatus === 'vacation' ? branch.vacationMode.customerMessage : undefined,
    vacationMessageAr: washShopStatus === 'vacation' ? branch.vacationMode.customerMessageAr : undefined,
    activeBranchId: branch.id,
  });
}

/** @deprecated Use syncWashBranchToShopExtras with an explicit branch. */
export async function syncActiveWashBranchToShopExtras(shopId: string, branch: WashBranch): Promise<void> {
  return syncWashBranchToShopExtras(shopId, branch);
}
