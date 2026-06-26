import AsyncStorage from '@react-native-async-storage/async-storage';

import { getShopById } from '@/lib/booking/catalogRepository';
import {
  addShopImage,
  getShopExtras,
  removeShopImage,
  setShopProfileImage,
  setShopProfileInfo,
  setShopSchedule,
  setShopServices,
  setShopWeeklyHours,
} from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras, ShopService } from '@/lib/booking/types';
import type { WashBranch } from '@/lib/booking/wash/types';

const SHOP_EXTRAS_KEY = '@pitstop/shop-extras/v1';

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
  const toRemove = (extras.imageUrls ?? []).filter((url) => !(branch.imageUrls ?? []).includes(url));
  for (const url of toRemove) {
    await removeShopImage(shopId, url);
  }
  for (const url of branch.imageUrls ?? []) {
    await addShopImage(shopId, url);
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

  const extrasAfter: ShopExtras = {
    ...(await getShopExtras(shopId)),
    washShopStatus: branch.vacationMode.enabled ? 'vacation' : branch.shopStatus,
    vacationReturnDate: branch.vacationMode.returnDate,
    vacationMessage: branch.vacationMode.customerMessage,
    vacationMessageAr: branch.vacationMode.customerMessageAr,
    activeBranchId: branch.id,
  };

  const raw = await AsyncStorage.getItem(SHOP_EXTRAS_KEY);
  const parsed = raw ? (JSON.parse(raw) as Record<string, ShopExtras>) : {};
  parsed[shopId] = extrasAfter;
  await AsyncStorage.setItem(SHOP_EXTRAS_KEY, JSON.stringify(parsed));
}

/** @deprecated Use syncWashBranchToShopExtras with an explicit branch. */
export async function syncActiveWashBranchToShopExtras(shopId: string, branch: WashBranch): Promise<void> {
  return syncWashBranchToShopExtras(shopId, branch);
}
