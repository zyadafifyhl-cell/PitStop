import type { Area } from '@/lib/booking/types';

export const DEMO_AREAS: Area[] = [
  { id: 'maadi', name: 'Maadi', nameAr: 'المعادي', city: 'Cairo', cityAr: 'القاهرة' },
  {
    id: 'nasr-city',
    name: 'Nasr City',
    nameAr: 'مدينة نصر',
    city: 'Cairo',
    cityAr: 'القاهرة',
  },
  {
    id: 'heliopolis',
    name: 'Heliopolis',
    nameAr: 'مصر الجديدة',
    city: 'Cairo',
    cityAr: 'القاهرة',
  },
  {
    id: 'october',
    name: '6th of October',
    nameAr: '6 أكتوبر',
    city: 'Giza',
    cityAr: 'الجيزة',
  },
  {
    id: 'mohandessin',
    name: 'Mohandessin',
    nameAr: 'المهندسين',
    city: 'Giza',
    cityAr: 'الجيزة',
  },
];

export function getAreaById(id: string): Area | undefined {
  return DEMO_AREAS.find((a) => a.id === id);
}

export function listAreasForServiceType(
  type: string,
  hasShopsInArea: (areaId: string) => boolean,
): Area[] {
  return DEMO_AREAS.filter((a) => hasShopsInArea(a.id));
}
