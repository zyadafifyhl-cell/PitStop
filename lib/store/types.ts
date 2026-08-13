export type StoreProductCategory = 'spare_parts' | 'accessories';

export type StoreCompatibilityType = 'universal' | 'brand_specific' | 'model_specific';

export type StoreFulfillmentMethod = 'cod' | 'pickup';

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
  name: string;
  description?: string;
  category: StoreProductCategory;
  subCategory: string;
  price: number;
  salePrice?: number;
  stockQuantity: number;
  imageUrl?: string;
  compatibilityType: StoreCompatibilityType;
  rating: number;
  ratingCount: number;
  isActive: boolean;
  compatibility: StoreProductCompatibility[];
  sellerLabel?: string;
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
};

export type ParsedVehicleIdentity = {
  year?: number;
  brand?: string;
  model?: string;
};

export type StoreProductDraft = {
  name: string;
  description?: string;
  category: StoreProductCategory;
  subCategory: string;
  price: number;
  stockQuantity: number;
  imageUrl?: string;
  compatibilityType: StoreCompatibilityType;
  compatibilityRows: Array<{
    brand?: string;
    model?: string;
    yearStart?: number;
    yearEnd?: number;
  }>;
};

export type StoreCategoryFilter = 'all' | StoreProductCategory;
