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

function mapStaffUser(row: UserRow): ShopStaffUser | null {
  if (!row.is_active || !row.shop_id) return null;
  if (row.role !== 'owner' && row.role !== 'branch_manager') return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? undefined,
    role: row.role,
    shopId: row.shop_id,
    branchId: row.branch_id,
  };
}

export async function fetchShopStaffUser(userId: string, email: string): Promise<ShopStaffUser | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role, shop_id, branch_id, is_active')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const mapped = mapStaffUser(data as UserRow);
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
  };
}

export async function resolveShopForStaff(staff: ShopStaffUser): Promise<Shop | null> {
  await ensureCatalog();
  return getShopById(staff.shopId) ?? null;
}

export async function resolveShopSession(
  userId: string,
  email: string,
): Promise<{ shop: Shop | null; staff: ShopStaffUser | null }> {
  const staff = await fetchShopStaffUser(userId, email);
  if (!staff) return { shop: null, staff: null };
  const shop = await resolveShopForStaff(staff);
  if (!shop) return { shop: null, staff: null };
  if (staff.role === 'branch_manager' && !staff.branchId) return { shop: null, staff: null };
  return { shop, staff };
}
