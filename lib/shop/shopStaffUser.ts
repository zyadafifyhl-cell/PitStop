import {
  fetchShopByIdRemote,
  findMerchantShopRemote,
  getShopById,
  getShopByOwnerEmail,
  hydrateCatalogCache,
  isCatalogReady,
  refreshCatalog,
} from '@/lib/booking/catalogRepository';
import type { Shop } from '@/lib/booking/types';
import type { DbUser, DbUserRole } from '@/lib/supabase/database.types';
import { getSupabase } from '@/lib/supabase/client';
import { isProSubscription, snapshotFromShopRow } from '@/lib/shop/subscription';

export type ShopStaffRole = Extract<DbUserRole, 'owner' | 'branch_manager'>;
export type AppStaffRole = Extract<DbUserRole, 'owner' | 'branch_manager' | 'admin' | 'pending_owner'>;

export type AppStaffUser = {
  id: string;
  email: string;
  fullName?: string;
  role: AppStaffRole;
  shopId?: string | null;
  branchId?: string | null;
  isActive: boolean;
};

export type ShopStaffUser = {
  id: string;
  email: string;
  fullName?: string;
  role: ShopStaffRole;
  shopId: string;
  branchId?: string | null;
};

type UserRow = Pick<
  DbUser,
  'id' | 'email' | 'full_name' | 'role' | 'shop_id' | 'branch_id' | 'is_active'
>;

async function ensureCatalog(): Promise<void> {
  if (!isCatalogReady()) await hydrateCatalogCache();
  if (!isCatalogReady()) await refreshCatalog();
}

function mapAppStaffUser(row: UserRow): AppStaffUser | null {
  if (row.role === 'admin') {
    if (!row.is_active) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name ?? undefined,
      role: 'admin',
      shopId: null,
      branchId: null,
      isActive: true,
    };
  }

  if (row.role === 'pending_owner') {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name ?? undefined,
      role: 'pending_owner',
      shopId: row.shop_id,
      branchId: null,
      isActive: false,
    };
  }

  if (!row.is_active || !row.shop_id) return null;
  if (row.role !== 'owner' && row.role !== 'branch_manager') return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? undefined,
    role: row.role,
    shopId: row.shop_id,
    branchId: row.branch_id,
    isActive: true,
  };
}

function toShopStaffUser(staff: AppStaffUser): ShopStaffUser | null {
  if (staff.role !== 'owner' && staff.role !== 'branch_manager') return null;
  if (!staff.shopId) return null;
  return {
    id: staff.id,
    email: staff.email,
    fullName: staff.fullName,
    role: staff.role,
    shopId: staff.shopId,
    branchId: staff.branchId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAppStaffUser(userId: string, email: string): Promise<AppStaffUser | null> {
  const retries = 3;
  const delayMs = 500;
  const supabase = getSupabase();

  for (let attempt = 0; attempt < retries; attempt++) {
    if (supabase) {
      const { data } = await supabase
        .from('users')
        .select('id, email, full_name, role, shop_id, branch_id, is_active')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        const mapped = mapAppStaffUser(data as UserRow);
        if (mapped?.role === 'pending_owner') {
          const liveShop = mapped.shopId
            ? await fetchShopByIdRemote(mapped.shopId)
            : await findMerchantShopRemote(email, 1, 0);
          if (liveShop && attempt < retries - 1) {
            await sleep(delayMs);
            continue;
          }
          return mapped;
        }
        if (mapped) return mapped;
      }
    }

    if (attempt < retries - 1) {
      await sleep(delayMs);
    }
  }

  await ensureCatalog();
  const shop = getShopByOwnerEmail(email) ?? (await findMerchantShopRemote(email));
  if (!shop) return null;
  return {
    id: userId,
    email: email.trim().toLowerCase(),
    role: 'owner',
    shopId: shop.id,
    branchId: null,
    isActive: true,
  };
}

/** @deprecated */
export async function fetchShopStaffUser(userId: string, email: string): Promise<ShopStaffUser | null> {
  const staff = await fetchAppStaffUser(userId, email);
  if (!staff) return null;
  return toShopStaffUser(staff);
}

async function enrichShopPremium(shop: Shop): Promise<Shop> {
  const supabase = getSupabase();
  if (!supabase) return { ...shop, isPremium: shop.isPremium === true };

  try {
    const { data } = await supabase
      .from('shops')
      .select('is_premium, subscription_tier, subscription_status, subscription_expires_at')
      .eq('id', shop.id)
      .maybeSingle();
    if (!data) return { ...shop, isPremium: shop.isPremium === true };
    const snapshot = snapshotFromShopRow(data);
    return {
      ...shop,
      isPremium: isProSubscription(snapshot),
      subscriptionTier: snapshot.tier,
      subscriptionStatus: snapshot.status,
      subscriptionExpiresAt: snapshot.expiresAt,
    };
  } catch {
    return { ...shop, isPremium: shop.isPremium === true };
  }
}

export async function resolveShopForStaff(staff: ShopStaffUser): Promise<Shop | null> {
  await ensureCatalog();
  const cached = getShopById(staff.shopId) ?? getShopByOwnerEmail(staff.email);
  const shop =
    cached ??
    (await fetchShopByIdRemote(staff.shopId)) ??
    (await findMerchantShopRemote(staff.email));
  if (!shop) return null;
  return enrichShopPremium(shop);
}

export async function resolveShopSession(
  userId: string,
  email: string,
): Promise<{ shop: Shop | null; staff: AppStaffUser | null; shopStaff: ShopStaffUser | null }> {
  const staff = await fetchAppStaffUser(userId, email);
  if (!staff) return { shop: null, staff: null, shopStaff: null };

  if (staff.role === 'admin') {
    return { shop: null, staff, shopStaff: null };
  }

  if (staff.role === 'pending_owner') {
    return { shop: null, staff, shopStaff: null };
  }

  const shopStaff = toShopStaffUser(staff);
  if (!shopStaff) return { shop: null, staff: null, shopStaff: null };

  const shop = await resolveShopForStaff(shopStaff);
  if (!shop) return { shop: null, staff: null, shopStaff: null };
  if (staff.role === 'branch_manager' && !staff.branchId) {
    return { shop: null, staff: null, shopStaff: null };
  }

  return { shop, staff, shopStaff };
}
