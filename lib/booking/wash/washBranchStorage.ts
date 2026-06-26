import AsyncStorage from '@react-native-async-storage/async-storage';

import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import type { Shop, ShopDayHours, ShopOffer, ShopService } from '@/lib/booking/types';
import type { WashBranch, WashBranchState, WashCoupon, WashShopStatus, WashVacationMode } from '@/lib/booking/wash/types';
import { syncWashBranchToShopExtras } from '@/lib/booking/wash/washSync';

const KEY = '@pitstop/wash-branches/v1';
type BranchMap = Record<string, WashBranchState>;

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

export async function getWashBranchState(shop: Shop): Promise<WashBranchState> {
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
  map[shop.id] = state;
  await writeMap(map);
  return state;
}

export async function getActiveWashBranch(shop: Shop): Promise<WashBranch> {
  const state = await getWashBranchState(shop);
  return state.branches.find((b) => b.id === state.activeBranchId) ?? state.branches[0];
}

export async function setActiveWashBranch(shop: Shop, branchId: string): Promise<WashBranchState> {
  const map = await readMap();
  const state = await getWashBranchState(shop);
  if (!state.branches.some((b) => b.id === branchId)) return state;
  state.activeBranchId = branchId;
  state.updatedAt = nowIso();
  map[shop.id] = state;
  await writeMap(map);
  const branch = state.branches.find((b) => b.id === state.activeBranchId)!;
  await syncWashBranchToShopExtras(shop.id, branch);
  return state;
}

export async function addWashBranch(shop: Shop, name: string, nameAr?: string): Promise<WashBranchState> {
  const map = await readMap();
  const state = await getWashBranchState(shop);
  const branch = emptyBranch(name.trim() || 'New branch', nameAr?.trim());
  state.branches = [...state.branches, branch];
  state.activeBranchId = branch.id;
  state.updatedAt = nowIso();
  map[shop.id] = state;
  await writeMap(map);
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
): Promise<WashBranch> {
  const map = await readMap();
  const state = await getWashBranchState(shop);
  state.branches = state.branches.map((branch) => {
    if (branch.id !== state.activeBranchId) return branch;
    return { ...branch, ...patch, updatedAt: nowIso() };
  });
  state.updatedAt = nowIso();
  map[shop.id] = state;
  await writeMap(map);
  const active = state.branches.find((b) => b.id === state.activeBranchId)!;
  await syncWashBranchToShopExtras(shop.id, active);
  return state.branches.find((b) => b.id === state.activeBranchId)!;
}

export async function deleteWashBranch(shop: Shop, branchId: string): Promise<WashBranchState> {
  const map = await readMap();
  const state = await getWashBranchState(shop);
  if (state.branches.length <= 1) return state;
  state.branches = state.branches.filter((b) => b.id !== branchId);
  if (state.activeBranchId === branchId) {
    state.activeBranchId = state.branches[0]?.id ?? 'main';
  }
  state.updatedAt = nowIso();
  map[shop.id] = state;
  await writeMap(map);
  const active = state.branches.find((b) => b.id === state.activeBranchId)!;
  await syncWashBranchToShopExtras(shop.id, active);
  return state;
}

export async function saveWashBranchServices(shop: Shop, services: ShopService[]): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { services });
}

export async function saveWashBranchWeeklyHours(shop: Shop, weeklyHours: ShopDayHours[]): Promise<WashBranch> {
  return updateActiveWashBranch(shop, {
    weeklyHours,
    scheduleSavedAt: nowIso(),
  });
}

export async function saveWashBranchCoupons(shop: Shop, coupons: WashCoupon[]): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { coupons });
}

export async function saveWashBranchOffers(shop: Shop, offers: ShopOffer[]): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { offers });
}

export async function saveWashBranchStatus(
  shop: Shop,
  shopStatus: WashShopStatus,
  vacationMode: WashVacationMode,
): Promise<WashBranch> {
  return updateActiveWashBranch(shop, { shopStatus, vacationMode });
}
