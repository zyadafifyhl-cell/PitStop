import AsyncStorage from '@react-native-async-storage/async-storage';

import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import type { Shop, ShopDayHours, ShopService } from '@/lib/booking/types';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import type { DbBranchEmployee, DbShopBranch } from '@/lib/supabase/database.types';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

import type { WashBranch, WashBranchState, WashShopStatus, WashVacationMode } from './types';

const ACTIVE_BRANCH_KEY = '@pitstop/wash-active-branch/v1';
const REMOTE_TIMEOUT_MS = 8000;

type BranchRow = DbShopBranch;
type ServiceRow = {
  id: string;
  shop_id: string;
  branch_id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  category: string | null;
  price_egp: number | string;
  duration_minutes: number;
  visible: boolean;
  sort_order: number;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'branch';
}

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), REMOTE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseWeeklyHours(raw: unknown): ShopDayHours[] {
  if (Array.isArray(raw) && raw.length > 0) return raw as ShopDayHours[];
  return defaultWeeklyHours();
}

function parseVacation(raw: unknown): WashVacationMode {
  if (raw && typeof raw === 'object') {
    const row = raw as WashVacationMode;
    return {
      enabled: !!row.enabled,
      returnDate: row.returnDate,
      customerMessage: row.customerMessage,
      customerMessageAr: row.customerMessageAr,
    };
  }
  return { enabled: false };
}

function parseImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function mapServiceRow(row: ServiceRow): ShopService {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    description: row.description ?? undefined,
    descriptionAr: row.description_ar ?? undefined,
    priceEgp: Number(row.price_egp),
    durationMinutes: row.duration_minutes,
    category: (row.category as ShopService['category']) ?? 'exterior_wash',
    active: row.visible,
    visible: row.visible,
    sortOrder: row.sort_order,
  };
}

function mapBranchRow(row: BranchRow, services: ShopService[]): WashBranch {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar ?? undefined,
    profileName: row.profile_name ?? row.name,
    profileNameAr: row.profile_name_ar ?? row.name_ar ?? undefined,
    profileAddress: row.address ?? undefined,
    profileAddressAr: row.address_ar ?? undefined,
    profilePhone: row.phone ?? undefined,
    profileEmail: row.profile_email ?? undefined,
    moreInfo: row.more_info ?? undefined,
    moreInfoAr: row.more_info_ar ?? undefined,
    profileImageUrl: row.profile_image_url ?? undefined,
    imageUrls: parseImages(row.image_urls),
    servicePriceEgp: row.service_price_egp != null ? Number(row.service_price_egp) : undefined,
    serviceDurationMinutes: row.service_duration_minutes ?? 60,
    weeklyHours: parseWeeklyHours(row.weekly_hours),
    services,
    offers: [],
    coupons: [],
    shopStatus: row.shop_status as WashShopStatus,
    vacationMode: parseVacation(row.vacation_mode),
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readActiveBranchMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_BRANCH_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeActiveBranchId(shopId: string, branchId: string): Promise<void> {
  const map = await readActiveBranchMap();
  map[shopId] = branchId;
  await AsyncStorage.setItem(ACTIVE_BRANCH_KEY, JSON.stringify(map));
}

export async function getPersistedActiveBranchId(shopId: string): Promise<string | null> {
  const map = await readActiveBranchMap();
  return map[shopId] ?? null;
}

async function fetchServicesForBranches(branchIds: string[]): Promise<Map<string, ShopService[]>> {
  const map = new Map<string, ShopService[]>();
  if (!branchIds.length) return map;
  const supabase = getSupabase();
  if (!supabase) return map;

  const response = await withTimeout(
    supabase
      .from('branch_services')
      .select('*')
      .in('branch_id', branchIds)
      .order('sort_order', { ascending: true }),
    null,
  );

  if (!response || response.error || !response.data) return map;
  for (const row of response.data as ServiceRow[]) {
    const list = map.get(row.branch_id) ?? [];
    list.push(mapServiceRow(row));
    map.set(row.branch_id, list);
  }
  return map;
}

export async function fetchWashBranchStateFromRemote(
  shop: Shop,
  staff: ShopStaffUser,
): Promise<WashBranchState | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  let query = supabase
    .from('shop_branches')
    .select('*')
    .eq('shop_id', shop.id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (staff.role === 'branch_manager' && staff.branchId) {
    query = query.eq('id', staff.branchId);
  }

  const response = await withTimeout(query, null);
  if (!response || response.error || !response.data?.length) return null;

  const rows = response.data as BranchRow[];
  const serviceMap = await fetchServicesForBranches(rows.map((row) => row.id));
  const branches = rows.map((row) => mapBranchRow(row, serviceMap.get(row.id) ?? []));

  let activeBranchId =
    staff.role === 'branch_manager' && staff.branchId
      ? staff.branchId
      : (await getPersistedActiveBranchId(shop.id)) ?? branches.find((b) => b.id)?.id ?? branches[0].id;

  if (!branches.some((b) => b.id === activeBranchId)) {
    activeBranchId = branches[0]?.id ?? activeBranchId;
  }

  if (staff.role === 'owner') {
    await writeActiveBranchId(shop.id, activeBranchId);
  }

  return {
    shopId: shop.id,
    activeBranchId,
    branches,
    updatedAt: new Date().toISOString(),
  };
}

function branchPatchToRow(patch: Partial<WashBranch>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) row.name = patch.name;
  if (patch.nameAr != null) row.name_ar = patch.nameAr;
  if (patch.profileName != null) row.profile_name = patch.profileName;
  if (patch.profileNameAr != null) row.profile_name_ar = patch.profileNameAr;
  if (patch.profileAddress != null) row.address = patch.profileAddress;
  if (patch.profileAddressAr != null) row.address_ar = patch.profileAddressAr;
  if (patch.profilePhone != null) row.phone = patch.profilePhone;
  if (patch.profileEmail != null) row.profile_email = patch.profileEmail;
  if (patch.moreInfo != null) row.more_info = patch.moreInfo;
  if (patch.moreInfoAr != null) row.more_info_ar = patch.moreInfoAr;
  if (patch.profileImageUrl != null) row.profile_image_url = patch.profileImageUrl;
  if (patch.imageUrls != null) row.image_urls = patch.imageUrls;
  if (patch.servicePriceEgp != null) row.service_price_egp = patch.servicePriceEgp;
  if (patch.serviceDurationMinutes != null) row.service_duration_minutes = patch.serviceDurationMinutes;
  if (patch.weeklyHours != null) row.weekly_hours = patch.weeklyHours;
  if (patch.shopStatus != null) row.shop_status = patch.shopStatus;
  if (patch.vacationMode != null) row.vacation_mode = patch.vacationMode;
  if (patch.latitude != null) row.latitude = patch.latitude;
  if (patch.longitude != null) row.longitude = patch.longitude;
  return row;
}

/** Resolve a local branch id (e.g. "main") to the Supabase UUID row. */
export async function resolveRemoteBranchId(shopId: string, branchId: string): Promise<string | null> {
  if (isUuid(branchId)) return branchId;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('shop_branches')
    .select('id, slug, is_default, sort_order')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    if (error) console.warn('resolveRemoteBranchId:', error.message);
    return null;
  }

  const preferred =
    data.find((row) => row.id === branchId) ??
    data.find((row) => row.slug === branchId) ??
    data.find((row) => row.slug === 'main') ??
    data.find((row) => row.is_default) ??
    data[0];

  return preferred?.id ?? null;
}

export async function updateBranchRemote(
  branchId: string,
  patch: Partial<WashBranch>,
  shopId?: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  let targetId = branchId;
  if (!isUuid(branchId)) {
    if (!shopId) return false;
    const resolved = await resolveRemoteBranchId(shopId, branchId);
    if (!resolved) return false;
    targetId = resolved;
  }

  const row = branchPatchToRow(patch);
  const { error } = await supabase.from('shop_branches').update(row).eq('id', targetId);
  if (error) console.warn('updateBranchRemote:', error.message);
  return !error;
}

export async function updateShopLocationRemote(
  shopId: string,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from('shops')
    .update({ latitude, longitude, updated_at: new Date().toISOString() })
    .eq('id', shopId);
  if (error) console.warn('updateShopLocationRemote:', error.message);
  return !error;
}

export async function saveBranchServicesRemote(
  shopId: string,
  branchId: string,
  services: ShopService[],
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const sanitizeCategory = (category: ShopService['category'] | undefined): string => {
    if (!category || category === 'custom') return 'exterior_wash';
    return category;
  };

  const { data: existingRows, error: existingError } = await supabase
    .from('branch_services')
    .select('id')
    .eq('branch_id', branchId);
  if (existingError) return false;
  const existingIds = new Set(
    (existingRows ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string'),
  );

  if (!services.length) {
    const { error } = await supabase.from('branch_services').delete().eq('branch_id', branchId);
    return !error;
  }

  const keepIds: string[] = [];
  for (let index = 0; index < services.length; index += 1) {
    const service = services[index];
    const baseRow = {
      shop_id: shopId,
      branch_id: branchId,
      name: service.name,
      name_ar: service.nameAr ?? null,
      description: service.description ?? null,
      description_ar: service.descriptionAr ?? null,
      category: sanitizeCategory(service.category),
      price_egp: service.priceEgp,
      duration_minutes: service.durationMinutes,
      visible: service.visible !== false,
      sort_order: service.sortOrder ?? index,
    };

    if (isUuid(service.id)) {
      if (existingIds.has(service.id)) {
        const { data, error } = await supabase
          .from('branch_services')
          .update(baseRow)
          .eq('id', service.id)
          .eq('branch_id', branchId)
          .select('id')
          .maybeSingle();
        if (error) return false;
        keepIds.push(data?.id ?? service.id);
      } else {
        // If an id came from another branch/state, never overwrite it across branches.
        const { data, error } = await supabase
          .from('branch_services')
          .insert(baseRow)
          .select('id')
          .maybeSingle();
        if (error || !data?.id) return false;
        keepIds.push(data.id);
      }
      continue;
    }

    const { data, error } = await supabase
      .from('branch_services')
      .insert(baseRow)
      .select('id')
      .maybeSingle();
    if (error || !data?.id) return false;
    keepIds.push(data.id);
  }

  const staleIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string' && !keepIds.includes(id));

  if (staleIds.length) {
    const { error } = await supabase
      .from('branch_services')
      .delete()
      .eq('branch_id', branchId)
      .in('id', staleIds);
    if (error) return false;
  }

  return true;
}

export async function addBranchRemote(
  shop: Shop,
  name: string,
  nameAr?: string,
  coords?: { latitude: number; longitude: number },
): Promise<WashBranch | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const baseSlug = slugify(name);
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
  const { data, error } = await supabase
    .from('shop_branches')
    .insert({
      shop_id: shop.id,
      slug,
      name: name.trim() || 'New branch',
      name_ar: nameAr?.trim() || null,
      area_id: shop.areaId,
      address: shop.address,
      address_ar: shop.addressAr,
      phone: shop.phone,
      latitude: coords?.latitude ?? shop.latitude,
      longitude: coords?.longitude ?? shop.longitude,
      profile_name: name.trim(),
      profile_name_ar: nameAr?.trim() || null,
      weekly_hours: defaultWeeklyHours(),
      shop_status: 'open',
      vacation_mode: {},
      is_default: false,
      sort_order: 99,
    })
    .select('*')
    .single();

  if (error || !data) return null;
  return mapBranchRow(data as BranchRow, []);
}

export async function listBranchEmployeesRemote(branchId: string): Promise<DbBranchEmployee[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('branch_employees')
    .select('*')
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  return (data ?? []) as DbBranchEmployee[];
}

export async function addBranchEmployeeRemote(input: {
  shopId: string;
  branchId: string;
  fullName: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
}): Promise<DbBranchEmployee | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('branch_employees')
    .insert({
      shop_id: input.shopId,
      branch_id: input.branchId,
      full_name: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  return data as DbBranchEmployee;
}

export async function removeBranchEmployeeRemote(employeeId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from('branch_employees').delete().eq('id', employeeId);
  return !error;
}

export async function persistActiveBranchRemote(shopId: string, branchId: string): Promise<void> {
  await writeActiveBranchId(shopId, branchId);
}

/** Default / main branch coordinates for customer maps & directions. */
export async function fetchDefaultBranchCoordinates(
  shopId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const branch = await fetchDefaultBranchProfile(shopId);
  if (!branch?.latitude || !branch?.longitude) return null;
  return { latitude: branch.latitude, longitude: branch.longitude };
}

/** Default branch profile for customer-facing shop pages (wash). */
export async function fetchDefaultBranchProfile(shopId: string): Promise<WashBranch | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const response = await withTimeout(
    supabase
      .from('shop_branches')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle(),
    null,
  );

  if (!response || response.error || !response.data) return null;
  const row = response.data as BranchRow;
  const serviceMap = await fetchServicesForBranches([row.id]);
  return mapBranchRow(row, serviceMap.get(row.id) ?? []);
}

/** Specific branch profile for customer-facing pages (wash). */
export async function fetchBranchProfile(shopId: string, branchId: string): Promise<WashBranch | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const resolvedBranchId = await resolveRemoteBranchId(shopId, branchId);
  if (!resolvedBranchId) return null;

  const response = await withTimeout(
    supabase
      .from('shop_branches')
      .select('*')
      .eq('shop_id', shopId)
      .eq('id', resolvedBranchId)
      .eq('is_active', true)
      .maybeSingle(),
    null,
  );

  if (!response || response.error || !response.data) return null;
  const row = response.data as BranchRow;
  const serviceMap = await fetchServicesForBranches([row.id]);
  return mapBranchRow(row, serviceMap.get(row.id) ?? []);
}
