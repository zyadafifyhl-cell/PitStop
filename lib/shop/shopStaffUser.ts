import {
  getShopById,
  getShopByOwnerEmail,
  hydrateCatalogCache,
  isCatalogReady,
  refreshCatalog,
} from '@/lib/booking/catalogRepository';
import type { Shop } from '@/lib/booking/types';
import type { DbUser, DbUserRole } from '@/lib/supabase/database.types';
import { getSupabase } from '@/lib/supabase/client';

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

export async function fetchAppStaffUser(userId: string, email: string): Promise<AppStaffUser | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role, shop_id, branch_id, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const mapped = mapAppStaffUser(data as UserRow);
      if (mapped) return mapped;
    }
  }

  await ensureCatalog();
  const shop = getShopByOwnerEmail(email);
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

export async function resolveShopForStaff(staff: ShopStaffUser): Promise<Shop | null> {
  await ensureCatalog();
  return getShopById(staff.shopId) ?? null;
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
