import type { ShopType } from '@/lib/booking/types';

export function parseShopType(raw: string | undefined): ShopType | null {
  if (raw === 'maintenance' || raw === 'wash' || raw === 'parts') return raw;
  if (raw === 'winch') return 'maintenance';
  return null;
}
