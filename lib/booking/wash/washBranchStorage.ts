import AsyncStorage from '@react-native-async-storage/async-storage';

import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import type { Shop, ShopDayHours, ShopOffer, ShopService } from '@/lib/booking/types';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import type { WashBranch, WashBranchState, WashCoupon, WashShopStatus, WashVacationMode } from '@/lib/booking/wash/types';
import {
  addBranchRemote,
  fetchWashBranchStateFromRemote,
  persistActiveBranchRemote,
  saveBranchServicesRemote,
  updateBranchRemote,
} from '@/lib/booking/wash/branchRepository';
import { syncWashBranchToShopExtras } from '@/lib/booking/wash/washSync';

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
  const branch = emptyBranch(
    extras.profileName || shop.name,
    extras.profileNameAr || shop.nameAr,
  );
  branch.id = 'main';
  branch.profileName = extras.profileName ?? shop.name;
  branch.profileNameAr = extras.profileNameAr ?? shop.nameAr;
  branch.profileAddress = extras.profileAddress ?? shop.address;
  branch.profileAddressAr = extras.profileAddressAr ?? shop.addressAr;
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
): Promise<WashBranchState> {
  if (ctx?.staff) {
    const remoteBranch = await addBranchRemote(shop, name, nameAr);
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
  state.branches = [...state.branches, branch];
  state.activeBranchId = branch.id;
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  await syncWashBranchToShopExtras(shop.id, branch);
  return state;
}

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
    >
  >,
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  const state = await getWashBranchState(shop, ctx);
  const activeId = state.activeBranchId;
  state.branches = state.branches.map((branch) => {
    if (branch.id !== activeId) return branch;
    return { ...branch, ...patch, updatedAt: nowIso() };
  });
  state.updatedAt = nowIso();
  await cacheState(shop.id, state);
  const active = activeBranchFromState(state);

  if (ctx?.staff && isUuid(active.id)) {
    await updateBranchRemote(active.id, patch);
    if (patch.services) {
      await saveBranchServicesRemote(shop.id, active.id, active.services);
    }
  }

  await syncWashBranchToShopExtras(shop.id, active);
  return active;
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
  return updateActiveWashBranch(shop, { services }, ctx);
}

export async function saveWashBranchWeeklyHours(
  shop: Shop,
  weeklyHours: ShopDayHours[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  return updateActiveWashBranch(
    shop,
    {
      weeklyHours,
      scheduleSavedAt: nowIso(),
    },
    ctx,
  );
}

export async function saveWashBranchCoupons(
  shop: Shop,
  coupons: WashCoupon[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { coupons }, ctx);
}

export async function saveWashBranchOffers(
  shop: Shop,
  offers: ShopOffer[],
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { offers }, ctx);
}

export async function saveWashBranchStatus(
  shop: Shop,
  shopStatus: WashShopStatus,
  vacationMode: WashVacationMode,
  ctx?: WashBranchContext,
): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { shopStatus, vacationMode }, ctx);
}
