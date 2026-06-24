export type ShopType = 'maintenance' | 'wash' | 'parts' | 'winch';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'done';

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
  ownerPassword: string;
  rating?: number;
};

export type Booking = {
  id: string;
  shopId: string;
  shopType: ShopType;
  customerId?: string;
  customerPhone: string;
  carType: string;
  carColor: string;
  /** Gross service price paid by customer in EGP. */
  servicePriceEgp?: number;
  /** Platform commission in EGP for this booking. */
  platformFeeEgp?: number;
  scheduledAt: string;
  status: BookingStatus;
  createdAt: string;
};

export type Area = {
  id: string;
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
};

export type SparePartItem = {
  id: string;
  shopId: string;
  name: string;
  imageUrl?: string;
  priceEgp: number;
  stockQty: number;
  createdAt: string;
  updatedAt: string;
};

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

export type ShopOffer = {
  id: string;
  title: string;
  titleAr?: string;
  validUntil: string;
  active: boolean;
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
  winchEnabled?: boolean;
  winchPhone?: string;
  imageUrls: string[];
  servicePriceEgp?: number;
  offers: ShopOffer[];
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
  | 'parts_order_confirmed'
  | 'parts_order_cancelled';

export type CustomerNotification = {
  id: string;
  customerId?: string;
  customerPhone: string;
  kind: CustomerNotificationKind;
  createdAt: string;
  shopId: string;
  bookingId?: string;
  orderId?: string;
  scheduledAt?: string;
  ownerNote?: string;
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
