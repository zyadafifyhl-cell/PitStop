import { formatEgp } from '@/lib/booking/reporting';
import type { ShopService } from '@/lib/booking/types';
import type { Locale, TranslationKey } from '@/lib/i18n/strings';

type PricedService = Pick<ShopService, 'priceEgp' | 'priceVariesByVehicle'>;

export function isVariablePriceService(service?: PricedService | null): boolean {
  return !!service?.priceVariesByVehicle;
}

export function formatShopServicePrice(
  service: PricedService | undefined,
  locale: Locale,
  t: (key: TranslationKey) => string,
): string {
  if (!service || isVariablePriceService(service)) return t('wash_service_price_by_car');
  return formatEgp(service.priceEgp, locale);
}

export function sumFixedServicePrices(services: PricedService[]): number {
  return services.reduce((sum, service) => (isVariablePriceService(service) ? sum : sum + (service.priceEgp || 0)), 0);
}
