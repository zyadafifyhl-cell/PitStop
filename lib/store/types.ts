export type StoreProductCategory = 'spare_parts' | 'accessories';

export type StoreCompatibilityType = 'universal' | 'brand_specific' | 'model_specific';

export type StoreFulfillmentMethod = 'cod' | 'pickup' | 'card';

/** `preparing` is the DB value; UI copy is Processing / قيد التجهيز والتغليف. */
export type StoreOrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export type StoreProductCompatibility = {
  id: string;
  productId: string;
  brand?: string;
  model?: string;
  yearStart?: number;
  yearEnd?: number;
};

export type StoreProduct = {
  id: string;
  shopId?: string;
  name: string;
  description?: string;
  category: StoreProductCategory;
  subCategory: string;
  price: number;
  salePrice?: number;
  stockQuantity: number;
  imageUrl?: string;
  imageUrls: string[];
  compatibilityType: StoreCompatibilityType;
  rating: number;
  ratingCount: number;
  isActive: boolean;
  compatibility: StoreProductCompatibility[];
  createdAt: string;
  updatedAt: string;
};

export type StoreCartItem = {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  product?: StoreProduct;
  createdAt: string;
  updatedAt: string;
};

export type StoreOrder = {
  id: string;
  userId: string;
  shopId?: string;
  subtotal: number;
  deliveryFee: number;
  totalPrice: number;
  fulfillmentMethod: StoreFulfillmentMethod;
  status: StoreOrderStatus;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoreOrderItem = {
  id: string;
  orderId: string;
  productId?: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  productImageUrl?: string;
};

export type CustomerStoreOrder = StoreOrder & {
  shopName?: string;
  shopNameAr?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopAddressAr?: string;
  items: StoreOrderItem[];
};

export type ParsedVehicleIdentity = {
  year?: number;
  brand?: string;
  model?: string;
};

export type StoreProductDraft = {
  shopId?: string;
  name: string;
  description?: string;
  category: StoreProductCategory;
  subCategory: string;
  price: number;
  stockQuantity: number;
  imageUrl?: string;
  imageUrls?: string[];
  compatibilityType: StoreCompatibilityType;
  compatibilityRows: Array<{
    brand?: string;
    model?: string;
    yearStart?: number;
    yearEnd?: number;
  }>;
};

export type StoreCategoryFilter = 'all' | StoreProductCategory;

export type StoreCartShopGroup = {
  shopId: string;
  shopName: string;
  items: StoreCartItem[];
  itemCount: number;
  subtotal: number;
};

export type StoreTopSellingProduct = {
  productId?: string;
  productName: string;
  unitsSold: number;
  totalSales: number;
};

export type StoreSalesReport = {
  grossRevenue: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  averageOrderValue: number;
  topSellingProducts: StoreTopSellingProduct[];
};
