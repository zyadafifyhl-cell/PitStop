import type { ShopType } from '@/lib/booking/types';

export function parseShopType(raw: string | undefined): ShopType | null {
  if (
    raw === 'maintenance' ||
    raw === 'wash' ||
    raw === 'detailing_studio' ||
    raw === 'parts' ||
    raw === 'accessories' ||
    raw === 'winch'
  ) return raw;
  return null;
}
