import type { StoreProductCategory } from '@/lib/store/types';

export const STORE_COD_DELIVERY_FEE_EGP = 50;

export const MAX_STORE_PRODUCT_IMAGES = 5;

/** Inclusive threshold used by inventory Low Stock and owner alerts. */
export const STORE_LOW_STOCK_MAX = 5;

export function isStoreLowStock(quantity: number): boolean {
  return Number(quantity) <= STORE_LOW_STOCK_MAX;
}

export const STORE_VEHICLE_BRANDS = [
  'Toyota',
  'Nissan',
  'Hyundai',
  'Kia',
  'Chevrolet',
  'BMW',
  'Mercedes-Benz',
  'Peugeot',
  'Renault',
  'Mitsubishi',
  'Suzuki',
  'Ford',
  'Honda',
  'MG',
  'Chery',
  'Geely',
] as const;

export const STORE_SUB_CATEGORIES: Record<
  StoreProductCategory | 'all',
  Array<{ id: string; labelEn: string; labelAr: string }>
> = {
  all: [
    { id: 'engine_oil', labelEn: 'Engine Oil', labelAr: 'زيت محرك' },
    { id: 'air_filters', labelEn: 'Filters', labelAr: 'فلاتر' },
    { id: 'brakes', labelEn: 'Brakes', labelAr: 'فرامل' },
    { id: 'car_care', labelEn: 'Car Care', labelAr: 'عناية بالسيارة' },
    { id: 'electronics', labelEn: 'Electronics', labelAr: 'إلكترونيات' },
    { id: 'interior', labelEn: 'Interior', labelAr: 'داخلية' },
    { id: 'exterior', labelEn: 'Exterior', labelAr: 'خارجية' },
  ],
  spare_parts: [
    { id: 'engine_oil', labelEn: 'Engine Oil', labelAr: 'زيت محرك' },
    { id: 'air_filters', labelEn: 'Filters', labelAr: 'فلاتر' },
    { id: 'brakes', labelEn: 'Brakes', labelAr: 'فرامل' },
    { id: 'fluids', labelEn: 'Fluids', labelAr: 'سوائل' },
    { id: 'batteries', labelEn: 'Batteries', labelAr: 'بطاريات' },
  ],
  accessories: [
    { id: 'car_care', labelEn: 'Car Care', labelAr: 'عناية بالسيارة' },
    { id: 'electronics', labelEn: 'Electronics', labelAr: 'إلكترونيات' },
    { id: 'interior', labelEn: 'Interior', labelAr: 'داخلية' },
    { id: 'exterior', labelEn: 'Exterior', labelAr: 'خارجية' },
  ],
};

export function subCategoryLabel(
  subCategory: string,
  locale: 'en' | 'ar',
  category: StoreProductCategory | 'all' = 'all',
): string {
  const pool = STORE_SUB_CATEGORIES[category] ?? STORE_SUB_CATEGORIES.all;
  const match = pool.find((row) => row.id === subCategory);
  if (!match) return subCategory;
  return locale === 'ar' ? match.labelAr : match.labelEn;
}
