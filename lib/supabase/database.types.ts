export type DbUserRole = 'customer' | 'owner' | 'branch_manager' | 'admin' | 'pending_owner';

export type DbShopOperatingStatus = 'open' | 'closed' | 'busy' | 'vacation';

export type DbBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'done'
  | 'cancelled'
  | 'no_show'
  | 'suspended_by_shop';

/** App identity row — public.users (mirrors auth.users). */
export type DbUser = {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
  role: DbUserRole;
  shop_id?: string | null;
  branch_id?: string | null;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

/** Brand / business. */
export type DbShop = {
  id: string;
  name: string;
  name_ar: string;
  type: 'maintenance' | 'wash' | 'parts' | 'accessories' | 'winch';
  area_id: string;
  address: string;
  address_ar: string;
  phone: string;
  latitude: number;
  longitude: number;
  owner_email: string;
  owner_user_id?: string | null;
  rating?: number | null;
  is_active: boolean;
  is_premium: boolean;
  created_at: string;
  updated_at: string;
};

/** Physical branch under a shop. */
export type DbShopBranch = {
  id: string;
  shop_id: string;
  slug: string;
  name: string;
  name_ar?: string | null;
  area_id?: string | null;
  address?: string | null;
  address_ar?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  profile_name?: string | null;
  profile_name_ar?: string | null;
  profile_email?: string | null;
  more_info?: string | null;
  more_info_ar?: string | null;
  profile_image_url?: string | null;
  image_urls: string[];
  service_price_egp?: number | null;
  service_duration_minutes: number;
  weekly_hours: unknown[];
  shop_status: DbShopOperatingStatus;
  vacation_mode: Record<string, unknown>;
  manager_user_id?: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Branch employee — no login account. */
export type DbBranchEmployee = {
  id: string;
  shop_id: string;
  branch_id: string;
  full_name: string;
  phone?: string | null;
  job_title?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Time-bound shop discount offer. */
export type DbOffer = {
  id: string;
  shop_id: string;
  title: string;
  title_ar?: string | null;
  description: string;
  discount_percentage: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Service menu item for a branch. */
export type DbBranchService = {
  id: string;
  shop_id: string;
  branch_id: string;
  name: string;
  name_ar?: string | null;
  description?: string | null;
  description_ar?: string | null;
  category?: string | null;
  price_egp: number;
  duration_minutes: number;
  visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
