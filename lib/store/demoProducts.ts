import type { StoreProduct, StoreProductCategory } from '@/lib/store/types';

const now = new Date().toISOString();

function demoProduct(input: {
  id: string;
  name: string;
  description: string;
  category: StoreProductCategory;
  subCategory: string;
  price: number;
  sellerLabel: string;
  rating?: number;
  ratingCount?: number;
  stockQuantity?: number;
}): StoreProduct {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    category: input.category,
    subCategory: input.subCategory,
    price: input.price,
    stockQuantity: input.stockQuantity ?? 24,
    compatibilityType: 'universal',
    rating: input.rating ?? 4.6,
    ratingCount: input.ratingCount ?? 128,
    isActive: true,
    compatibility: [],
    sellerLabel: input.sellerLabel,
    createdAt: now,
    updatedAt: now,
  };
}

/** Stable IDs shared with supabase/apply-pitstop-2.0-step26-seed-store-products.sql */
export const DEMO_STORE_PRODUCTS: StoreProduct[] = [
  demoProduct({
    id: 'a1000001-0001-4000-8000-000000000001',
    name: 'Shell Helix Oil',
    description: 'Fully synthetic 5W-30 engine oil',
    category: 'spare_parts',
    subCategory: 'engine_oil',
    price: 1800,
    sellerLabel: 'AutoCare Maadi',
    rating: 4.8,
    ratingCount: 312,
  }),
  demoProduct({
    id: 'a1000001-0002-4000-8000-000000000002',
    name: 'Bosch Brake Pads',
    description: 'Front ceramic brake pad set',
    category: 'spare_parts',
    subCategory: 'brakes',
    price: 1200,
    sellerLabel: 'Elite Motors Nasr City',
    rating: 4.7,
    ratingCount: 189,
  }),
  demoProduct({
    id: 'a1000001-0003-4000-8000-000000000003',
    name: 'Varta Battery',
    description: '70Ah maintenance-free battery',
    category: 'spare_parts',
    subCategory: 'batteries',
    price: 3400,
    sellerLabel: 'PowerStart 6th October',
    rating: 4.9,
    ratingCount: 96,
  }),
  demoProduct({
    id: 'a1000001-0004-4000-8000-000000000004',
    name: 'Areon Car Freshener',
    description: 'Long-lasting cabin fragrance',
    category: 'accessories',
    subCategory: 'car_care',
    price: 95,
    sellerLabel: 'PitStop Accessories Hub',
    rating: 4.5,
    ratingCount: 540,
  }),
  demoProduct({
    id: 'a1000001-0005-4000-8000-000000000005',
    name: 'MANN Air Filter',
    description: 'OEM-grade air filter element',
    category: 'spare_parts',
    subCategory: 'air_filters',
    price: 420,
    sellerLabel: 'German Parts Zamalek',
    rating: 4.6,
    ratingCount: 74,
  }),
  demoProduct({
    id: 'a1000001-0006-4000-8000-000000000006',
    name: 'Castrol Edge 5W-40',
    description: 'High-performance synthetic oil',
    category: 'spare_parts',
    subCategory: 'engine_oil',
    price: 1650,
    sellerLabel: 'Speed Garage Heliopolis',
    rating: 4.7,
    ratingCount: 201,
  }),
  demoProduct({
    id: 'a1000001-0007-4000-8000-000000000007',
    name: 'Michelin Wiper Blades',
    description: 'All-season windshield wipers (pair)',
    category: 'accessories',
    subCategory: 'exterior',
    price: 380,
    sellerLabel: 'DriveStyle Mohandessin',
    rating: 4.4,
    ratingCount: 63,
  }),
  demoProduct({
    id: 'a1000001-0008-4000-8000-000000000008',
    name: 'Pioneer Dash Cam',
    description: '1080p front camera with night mode',
    category: 'accessories',
    subCategory: 'electronics',
    price: 2200,
    sellerLabel: 'TechDrive New Cairo',
    rating: 4.8,
    ratingCount: 118,
  }),
  demoProduct({
    id: 'a1000001-0009-4000-8000-000000000009',
    name: 'NGK Spark Plugs (Set of 4)',
    description: 'Iridium spark plug kit',
    category: 'spare_parts',
    subCategory: 'fluids',
    price: 890,
    sellerLabel: 'ProTune Dokki',
    rating: 4.6,
    ratingCount: 44,
  }),
  demoProduct({
    id: 'a1000001-000a-4000-8000-00000000000a',
    name: 'Leather Interior Cleaner',
    description: 'Premium cabin leather care kit',
    category: 'accessories',
    subCategory: 'interior',
    price: 260,
    sellerLabel: 'LuxDetailing Giza',
    rating: 4.3,
    ratingCount: 87,
  }),
];

const demoById = new Map(DEMO_STORE_PRODUCTS.map((row) => [row.id, row]));

/** Merge DB catalog with seller labels from the demo catalog when IDs match. */
export function mergeStoreCatalogProducts(remote: StoreProduct[]): StoreProduct[] {
  const remoteIds = new Set(remote.map((row) => row.id));
  const enriched = remote.map((row) => {
    const demo = demoById.get(row.id);
    if (!demo) return row;
    return { ...row, sellerLabel: demo.sellerLabel };
  });
  const demoOnly = DEMO_STORE_PRODUCTS.filter((row) => !remoteIds.has(row.id));
  return [...demoOnly, ...enriched];
}
