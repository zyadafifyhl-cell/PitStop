export type ShopType = 'maintenance' | 'wash' | 'parts' | 'accessories' | 'winch';

export type StoreCategory = 'parts' | 'accessories';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'done' | 'in_progress' | 'no_show';

export type BookingType = 'app' | 'walk_in';

export type Shop = {
  id: string;
  name: string;
  nameAr: string;
  type: ShopType;
  areaId: string;
  address: string;
  addressAr: string;
  phone: string;
  latitude: number;
  longitude: number;
  ownerEmail: string;
  rating?: number;
  /** SaaS tier — unlocks premium wash owner CMS sections. */
  isPremium?: boolean;
};

export type Booking = {
  id: string;
  shopId: string;
  shopType: ShopType;
  customerId?: string;
  customerPhone: string;
  carType: string;
  carColor: string;
  vehicleId?: string;
  serviceId?: string;
  serviceName?: string;
  serviceNameAr?: string;
  serviceDurationMinutes?: number;
  customerNotes?: string;
  ownerRejectionNote?: string;
  customerName?: string;
  branchId?: string;
  /** app = mobile booking; walk_in = branch POS / offline customer. */
  bookingType?: BookingType;
  /** Gross service price paid by customer in EGP. */
  servicePriceEgp?: number;
  /** Platform commission in EGP for this booking. */
  platformFeeEgp?: number;
  /** Applied shop offer (Supabase public.offers.id). */
  offerId?: string;
  /** Subtotal before loyalty redemption (Step 4 checkout). */
  originalPriceEgp?: number;
  /** Loyalty points redeemed at checkout for this merchant. */
  pointsRedeemed?: number;
  /** EGP discount from loyalty redemption. */
  discountAppliedEgp?: number;
  /** Net amount paid after discounts — basis for earn rule. */
  finalAmountPaidEgp?: number;
  scheduledAt: string;
  status: BookingStatus;
  createdAt: string;
  /** Read-time flag when confirmed slot aged past auto-done window (not persisted). */
  lifecycleAutoCompleted?: boolean;
};

export type Area = {
  id: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
};

export type StoreItem = {
  id: string;
  shopId: string;
  category: StoreCategory;
  name: string;
  imageUrl?: string;
  priceEgp: number;
  stockQty: number;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated Use StoreItem */
export type SparePartItem = StoreItem;

export type PartsOrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'shipped';

export type PartsOrderItem = {
  partId: string;
  name: string;
  qty: number;
  unitPriceEgp: number;
  lineTotalEgp: number;
};

export type PartsOrder = {
  id: string;
  shopId: string;
  customerId?: string;
  customerPhone: string;
  shippingAddress: string;
  items: PartsOrderItem[];
  subtotalEgp: number;
  platformFeeEgp: number;
  totalEgp: number;
  status: PartsOrderStatus;
  createdAt: string;
};

export type OfferType = 'percentage' | 'flat_amount' | 'buy_x_get_y';

export type ShopOffer = {
  id: string;
  shopId?: string;
  title: string;
  titleAr?: string;
  description?: string;
  offerType: OfferType;
  discountValue: number;
  requiredWashCount: number;
  expiresAt?: string | null;
  /** Legacy percentage field — kept for backward compatibility. */
  discountPercentage: number;
  startDate: string;
  endDate: string;
  /** Legacy alias of endDate for older cached rows. */
  validUntil: string;
  active: boolean;
  createdAt: string;
};

export type WashServiceCategory =
  | 'exterior_wash'
  | 'interior_cleaning'
  | 'full_package'
  | 'detailing'
  | 'engine_cleaning'
  | 'custom';

export type ShopService = {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  priceEgp: number;
  durationMinutes: number;
  category?: WashServiceCategory;
  active: boolean;
  /** When false, hidden from customers but kept in owner list. */
  visible?: boolean;
  sortOrder: number;
};

export type ShopDayHours = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openTime?: string;
  closeTime?: string;
  closed?: boolean;
  breakStartTime?: string;
  breakEndTime?: string;
};

export type CustomerVehicle = {
  id: string;
  label: string;
  makeModel: string;
  color?: string;
  plate?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShopReview = {
  id: string;
  shopId: string;
  customerId?: string;
  customerName: string;
  rating: number;
  body: string;
  likes: number;
  likedBy: string[];
  ownerReply?: string;
  hidden?: boolean;
  reported?: boolean;
  createdAt: string;
};

export type ShopExtras = {
  shopId: string;
  profileImageUrl?: string;
  profileName?: string;
  profileNameAr?: string;
  profileAddress?: string;
  profileAddressAr?: string;
  profilePhone?: string;
  profileEmail?: string;
  moreInfo?: string;
  moreInfoAr?: string;
  winchEnabled?: boolean;
  winchPhone?: string;
  imageUrls: string[];
  servicePriceEgp?: number;
  /** Daily opening time HH:mm (e.g. 12:00). */
  workOpenTime?: string;
  /** Daily closing time HH:mm (e.g. 22:00). */
  workCloseTime?: string;
  /** Minutes per booking slot (e.g. 30 for car wash). */
  serviceDurationMinutes?: number;
  /** Set when owner saves working hours — customer booking uses these slots. */
  scheduleSavedAt?: string;
  /** Per-day hours controlled from owner dashboard. */
  weeklyHours?: ShopDayHours[];
  /** Wash/service menu items with price and duration. */
  services?: ShopService[];
  offers: ShopOffer[];
  /** Wash-only live status synced from active branch. */
  washShopStatus?: 'open' | 'closed' | 'busy' | 'vacation';
  vacationReturnDate?: string;
  vacationMessage?: string;
  vacationMessageAr?: string;
  activeBranchId?: string;
  updatedAt: string;
};

export type OwnerNotificationKind = 'service_booking' | 'parts_order';

export type OwnerNotificationResolution = 'approved' | 'declined';

export type OwnerNotification = {
  id: string;
  shopId: string;
  kind: OwnerNotificationKind;
  createdAt: string;
  bookingId?: string;
  orderId?: string;
  customerPhone: string;
  shopType?: ShopType;
  carType?: string;
  scheduledAt?: string;
  totalEgp?: number;
  partsCount?: number;
  resolution?: OwnerNotificationResolution;
  ownerNote?: string;
  resolvedAt?: string;
};

export type CustomerNotificationKind =
  | 'booking_approved'
  | 'booking_declined'
  | 'booking_reminder'
  | 'parts_order_confirmed'
  | 'parts_order_cancelled'
  | 'review_owner_reply';

export type CustomerNotification = {
  id: string;
  customerId?: string;
  customerPhone: string;
  kind: CustomerNotificationKind;
  createdAt: string;
  shopId: string;
  bookingId?: string;
  orderId?: string;
  reviewId?: string;
  scheduledAt?: string;
  ownerNote?: string;
  /** Minutes before appointment (booking_reminder only). */
  reminderMinutesBefore?: number;
  /** High-priority flag for confirmed booking alerts. */
  highPriority?: boolean;
};

export type CustomerInvoice = {
  id: string;
  customerId?: string;
  customerPhone: string;
  customerEmail?: string;
  orderId: string;
  shopId: string;
  shippingAddress: string;
  items: PartsOrderItem[];
  subtotalEgp: number;
  platformFeeEgp: number;
  totalEgp: number;
  status: PartsOrderStatus;
  createdAt: string;
  emailedAt?: string;
};
