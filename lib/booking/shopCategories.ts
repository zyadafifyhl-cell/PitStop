import type { ShopType } from '@/lib/booking/types';
import type { TranslationKey } from '@/lib/i18n/strings';

/** Public five-category taxonomy stored on shops.category. */
export type PitStopCategory = 'car_wash' | 'detailing_studio' | 'workshop' | 'parts_shop' | 'driver_network';

export type MerchantTypeOption = {
  type: ShopType;
  category: PitStopCategory;
  titleKey: TranslationKey;
  subKey: TranslationKey;
  icon: 'tint' | 'shield' | 'wrench' | 'cogs' | 'shopping-bag';
};

/** Types a merchant can pick while registering. Winch/rescue is paused for now. */
export const MERCHANT_TYPE_OPTIONS: MerchantTypeOption[] = [
  {
    type: 'wash',
    category: 'car_wash',
    titleKey: 'service_wash_title',
    subKey: 'service_wash_sub',
    icon: 'tint',
  },
  {
    type: 'detailing_studio',
    category: 'detailing_studio',
    titleKey: 'service_detailing_title',
    subKey: 'service_detailing_sub',
    icon: 'shield',
  },
  {
    type: 'maintenance',
    category: 'workshop',
    titleKey: 'service_maintenance_title',
    subKey: 'service_maintenance_sub',
    icon: 'wrench',
  },
  {
    type: 'parts',
    category: 'parts_shop',
    titleKey: 'service_parts_title',
    subKey: 'service_parts_sub',
    icon: 'cogs',
  },
  {
    type: 'accessories',
    category: 'parts_shop',
    titleKey: 'service_accessories_title',
    subKey: 'service_accessories_sub',
    icon: 'shopping-bag',
  },
];

export const DETAILING_WARRANTY_OPTIONS = ['1 Year', '3 Years', '5 Years'] as const;

export const DETAILING_DURATION_DAYS = [1, 2, 3, 5, 7] as const;

export function categoryForShopType(type: ShopType): PitStopCategory {
  if (type === 'wash') return 'car_wash';
  if (type === 'detailing_studio') return 'detailing_studio';
  if (type === 'maintenance') return 'workshop';
  if (type === 'winch') return 'driver_network';
  return 'parts_shop';
}

export function isDetailingShopType(type: ShopType | undefined): type is 'detailing_studio' {
  return type === 'detailing_studio';
}

export function formatWarrantyBadge(warranty: string | undefined, locale: 'en' | 'ar'): string | null {
  const value = warranty?.trim();
  if (!value) return null;
  if (locale !== 'ar') return value;
  if (value === '1 Year') return 'ضمان سنة';
  if (value === '3 Years') return 'ضمان 3 سنوات';
  if (value === '5 Years') return 'ضمان 5 سنوات';
  return value;
}

export function isMultiStageDetailingService(input: {
  category?: string;
  name?: string;
  nameAr?: string;
}): boolean {
  if (input.category === 'detailing') return true;
  const haystack = `${input.name ?? ''} ${input.nameAr ?? ''}`.toLowerCase();
  return haystack.includes('multi-stage') || haystack.includes('ppf') || haystack.includes('ceramic');
}
