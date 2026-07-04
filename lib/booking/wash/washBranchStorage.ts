import AsyncStorage from '@react-native-async-storage/async-storage';

import { patchShopCoordinates } from '@/lib/booking/catalogRepository';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import type { Shop, ShopDayHours, ShopOffer, ShopService } from '@/lib/booking/types';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import type { WashBranch, WashBranchState, WashCoupon, WashShopStatus, WashVacationMode } from '@/lib/booking/wash/types';
import {
  addBranchRemote,
  fetchWashBranchStateFromRemote,
  persistActiveBranchRemote,
  resolveRemoteBranchId,
  saveBranchServicesRemote,
  updateBranchRemote,
  updateShopLocationRemote,
} from '@/lib/booking/wash/branchRepository';
import { syncWashBranchToShopExtras } from '@/lib/booking/wash/washSync';
import { persistImageUri, persistImageUris } from '@/lib/media/persistImageUri';

const KEY = '@pitstop/wash-branches/v1';
type BranchMap = Record<string, WashBranchState>;

export type WashBranchContext = {
  staff: ShopStaffUser;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readMap(): Promise<BranchMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as BranchMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: BranchMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

function emptyBranch(name: string, nameAr?: string): WashBranch {
  const stamp = nowIso();
  return {
    id: id('branch'),
    name,
    nameAr,
    imageUrls: [],
    weeklyHours: defaultWeeklyHours(),
    services: [],
    offers: [],
    coupons: [],
    shopStatus: 'open',
    vacationMode: { enabled: false },
    serviceDurationMinutes: 60,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

async function branchFromExtras(shop: Shop, extras: Awaited<ReturnType<typeof getShopExtras>>): Promise<WashBranch> {
  const branch = emptyBranch(extras.profileName || shop.name, extras.profileNameAr ?? '');
  branch.id = 'main';
  branch.profileName = extras.profileName ?? shop.name;
  branch.profileNameAr = extras.profileNameAr ?? '';
  branch.profileAddress = extras.profileAddress ?? shop.address;
  branch.profileAddressAr = extras.profileAddressAr ?? '';
  branch.profilePhone = extras.profilePhone ?? shop.phone;
  branch.profileEmail = extras.profileEmail;
  branch.moreInfo = extras.moreInfo;
  branch.moreInfoAr = extras.moreInfoAr;
  branch.profileImageUrl = extras.profileImageUrl;
  branch.imageUrls = extras.imageUrls ?? [];
  branch.servicePriceEgp = extras.servicePriceEgp;
  branch.workOpenTime = extras.workOpenTime;
  branch.workCloseTime = extras.workCloseTime;
  branch.serviceDurationMinutes = extras.serviceDurationMinutes ?? 60;
  branch.weeklyHours = extras.weeklyHours?.length ? extras.weeklyHours : defaultWeeklyHours();
  branch.services = extras.services ?? [];
  branch.offers = extras.offers ?? [];
  branch.shopStatus = extras.washShopStatus ?? 'open';
  branch.vacationMode = {
    enabled: extras.washShopStatus === 'vacation',
    returnDate: extras.vacationReturnDate,
    customerMessage: extras.vacationMessage,
    customerMessageAr: extras.vacationMessageAr,
  };
  branch.scheduleSavedAt = extras.scheduleSavedAt;
  branch.latitude = shop.latitude;
  branch.longitude = shop.longitude;
  return branch;
}

async function cacheState(shopId: string, state: WashBranchState): Promise<void> {
  const map = await readMap();
  map[shopId] = state;
  await writeMap(map);
}

function activeBranchFromState(state: WashBranchState): WashBranch {
  return state.branches.find((b) => b.id === state.activeBranchId) ?? state.branches[0];
}

async function syncActiveBranchExtras(shop: Shop, state: WashBranchState): Promise<void> {
  const branch = activeBranchFromState(state);
  if (branch) await syncWashBranchToShopExtras(shop.id, branch);
}

export async function getWashBranchState(shop: Shop, ctx?: WashBranchContext): Promise<WashBranchState> {
  if (ctx?.staff) {
    const remote = await fetchWashBranchStateFromRemote(shop, ctx.staff);
    if (remote) {
      await cacheState(shop.id, remote);
      return remote;
    }
  }

  const map = await readMap();
  const existing = map[shop.id];
  if (existing?.branches?.length) return existing;

  const extras = await getShopExtras(shop.id);
  const main = await branchFromExtras(shop, extras);
  const state: WashBranchState = {
    shopId: shop.id,
    activeBranchId: main.id,
    branches: [main],
    updatedAt: nowIso(),
  };
  await cacheState(shop.id, state);
  return state;
}

export async function getActiveWashBranch(shop: Shop, ctx?: WashBranchContext): Promise<WashBranch> {
  const state = await getWashBranchState(shop, ctx);
  return activeBranchFromState(state);
}

export async function setActiveWashBranch(
  shop: Shop,
  branchId: string,
  ctx?: WashBranchContext,
): Promise<WashBranchState> {
  const state = await getWashBranchState(shop, ctx);
  if (!state.branches.some((b) => b.id === branchId)) return state;
  state.activeBranchId = branchId;
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  if (ctx?.staff.role === 'owner') {
    await persistActiveBranchRemote(shop.id, branchId);
  }
  await syncActiveBranchExtras(shop, state);
  return state;
}

export async function addWashBranch(
  shop: Shop,
  name: string,
  nameAr?: string,
  ctx?: WashBranchContext,
  coords?: { latitude: number; longitude: number },
): Promise<WashBranchState> {
  if (ctx?.staff) {
    const remoteBranch = await addBranchRemote(shop, name, nameAr, coords);
    if (remoteBranch) {
      const state = await getWashBranchState(shop, ctx);
      state.branches = [...state.branches.filter((b) => b.id !== remoteBranch.id), remoteBranch];
      state.activeBranchId = remoteBranch.id;
      state.updatedAt = nowIso();
      await cacheState(shop.id, state);
      await persistActiveBranchRemote(shop.id, remoteBranch.id);
      await syncWashBranchToShopExtras(shop.id, remoteBranch);
      return state;
    }
  }

  const state = await getWashBranchState(shop, ctx);
  const branch = emptyBranch(name.trim() || 'New branch', nameAr?.trim());
  if (coords) {
    branch.latitude = coords.latitude;
    branch.longitude = coords.longitude;
  } else {
    branch.latitude = shop.latitude;
    branch.longitude = shop.longitude;
  }
  state.branches = [...state.branches, branch];
  state.activeBranchId = branch.id;
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  await syncWashBranchToShopExtras(shop.id, branch);
  return state;
}

export type WashBranchUpdateResult = {
  branch: WashBranch;
  /** True when coordinates/profile were written to Supabase (when configured). */
  remoteSaved: boolean;
};

export async function updateActiveWashBranch(
  shop: Shop,
  patch: Partial<
    Pick<
      WashBranch,
      | 'name'
      | 'nameAr'
      | 'profileName'
      | 'profileNameAr'
      | 'profileAddress'
      | 'profileAddressAr'
      | 'profilePhone'
      | 'profileEmail'
      | 'moreInfo'
      | 'moreInfoAr'
      | 'profileImageUrl'
      | 'imageUrls'
      | 'servicePriceEgp'
      | 'workOpenTime'
      | 'workCloseTime'
      | 'serviceDurationMinutes'
      | 'weeklyHours'
      | 'services'
      | 'offers'
      | 'coupons'
      | 'shopStatus'
      | 'vacationMode'
      | 'scheduleSavedAt'
      | 'latitude'
      | 'longitude'
    >
  >,
  ctx?: WashBranchContext,
): Promise<WashBranchUpdateResult> {
  const normalizedPatch = { ...patch };
  if (patch.profileImageUrl) {
    normalizedPatch.profileImageUrl = await persistImageUri(patch.profileImageUrl);
  }
  if (patch.imageUrls) {
    normalizedPatch.imageUrls = await persistImageUris(patch.imageUrls);
  }

  const state = await getWashBranchState(shop, ctx);
  const activeId = state.activeBranchId;
  state.branches = state.branches.map((branch) => {
    if (branch.id !== activeId) return branch;
    return { ...branch, ...normalizedPatch, updatedAt: nowIso() };
  });
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  let active = activeBranchFromState(state);
  let remoteSaved = !ctx?.staff;

  if (ctx?.staff) {
    remoteSaved = false;
    let remoteBranchId = isUuid(active.id) ? active.id : await resolveRemoteBranchId(shop.id, active.id);
    if (remoteBranchId && !isUuid(active.id)) {
      state.branches = state.branches.map((branch) =>
        branch.id === active.id ? { ...branch, id: remoteBranchId! } : branch,
      );
      if (state.activeBranchId === active.id) state.activeBranchId = remoteBranchId;
      await cacheState(shop.id, state);
      active = activeBranchFromState(state);
    }

    if (remoteBranchId) {
      remoteSaved = await updateBranchRemote(remoteBranchId, normalizedPatch, shop.id);
      if (normalizedPatch.latitude != null && normalizedPatch.longitude != null) {
        const shopSaved = await updateShopLocationRemote(shop.id, normalizedPatch.latitude, normalizedPatch.longitude);
        remoteSaved = remoteSaved && shopSaved;
        if (shopSaved) patchShopCoordinates(shop.id, normalizedPatch.latitude, normalizedPatch.longitude);
      }
      if (normalizedPatch.services) {
        await saveBranchServicesRemote(shop.id, remoteBranchId, active.services);
      }
    }
  }

  await syncWashBranchToShopExtras(shop.id, active);
  return { branch: active, remoteSaved };
}

export async function saveBranchCoordinates(
  shop: Shop,
  latitude: number,
  longitude: number,
  ctx?: WashBranchContext,
): Promise<WashBranchUpdateResult> {
  return updateActiveWashBranch(shop, { latitude, longitude }, ctx);
}

export async function deleteWashBranch(
  shop: Shop,
  branchId: string,
  ctx?: WashBranchContext,
): Promise<WashBranchState> {
  const state = await getWashBranchState(shop, ctx);
  if (state.branches.length <= 1) return state;
  state.branches = state.branches.filter((b) => b.id !== branchId);
  if (state.activeBranchId === branchId) {
    state.activeBranchId = state.branches[0]?.id ?? 'main';
  }
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  await syncActiveBranchExtras(shop, state);
  return state;
}

export async function saveWashBranchServices(
  shop: Shop,
  services: ShopService[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const { branch } = await updateActiveWashBranch(shop, { services }, ctx);
  return branch;
}

export async function saveWashBranchWeeklyHours(
  shop: Shop,
  weeklyHours: ShopDayHours[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const { branch } = await updateActiveWashBranch(
    shop,
    {
      weeklyHours,
      scheduleSavedAt: nowIso(),
    },
    ctx,
  );
  return branch;
}

export async function saveWashBranchCoupons(
  shop: Shop,
  coupons: WashCoupon[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const { branch } = await updateActiveWashBranch(shop, { coupons }, ctx);
  return branch;
}

export async function saveWashBranchOffers(
  shop: Shop,
  offers: ShopOffer[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const { branch } = await updateActiveWashBranch(shop, { offers }, ctx);
  return branch;
}

export async function saveWashBranchStatus(
  shop: Shop,
  shopStatus: WashShopStatus,
  vacationMode: WashVacationMode,
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const { branch } = await updateActiveWashBranch(shop, { shopStatus, vacationMode }, ctx);
  return branch;
}
