import type { Shop, ShopType } from '@/lib/booking/types';

/** Demo shops — replace with Supabase rows later. */
export const DEMO_SHOPS: Shop[] = [
  {
    id: 'shop-wash-nile',
    name: 'Nile Auto Wash',
    nameAr: 'مغسلة النيل',
    type: 'wash',
    areaId: 'maadi',
    address: 'Street 9, Maadi',
    addressAr: 'شارع 9، المعادي',
    phone: '+201022334455',
    latitude: 29.9602,
    longitude: 31.2569,
    ownerEmail: 'wash@demo.com',
    ownerPassword: 'demo123',
    rating: 4.8,
  },
  {
    id: 'shop-wash-city',
    name: 'City Shine Wash',
    nameAr: 'مغسلة سيتي شاين',
    type: 'wash',
    areaId: 'nasr-city',
    address: 'Abbas El Akkad St.',
    addressAr: 'شارع عباس العقاد',
    phone: '+201055667788',
    latitude: 30.0511,
    longitude: 31.3656,
    ownerEmail: 'wash2@demo.com',
    ownerPassword: 'demo123',
    rating: 4.6,
  },
  {
    id: 'shop-wash-mohandessin',
    name: 'Premium Wash Mohandessin',
    nameAr: 'مغسلة Premium المهندسين',
    type: 'wash',
    areaId: 'mohandessin',
    address: 'Gameat El Dewal',
    addressAr: 'جامعة الدول',
    phone: '+201066778899',
    latitude: 30.0626,
    longitude: 31.2,
    ownerEmail: 'wash3@demo.com',
    ownerPassword: 'demo123',
    rating: 4.7,
  },
  {
    id: 'shop-maint-autofix',
    name: 'AutoFix Service Center',
    nameAr: 'مركز AutoFix للصيانة',
    type: 'maintenance',
    areaId: 'october',
    address: 'Industrial Zone, 6th October',
    addressAr: 'المنطقة الصناعية، 6 أكتوبر',
    phone: '+201011223344',
    latitude: 29.9285,
    longitude: 30.9188,
    ownerEmail: 'maintenance@demo.com',
    ownerPassword: 'demo123',
    rating: 4.9,
  },
  {
    id: 'shop-maint-elite',
    name: 'Elite Motors Workshop',
    nameAr: 'ورشة Elite Motors',
    type: 'maintenance',
    areaId: 'heliopolis',
    address: 'El Merghany St.',
    addressAr: 'شارع الميرغني',
    phone: '+201077889900',
    latitude: 30.0875,
    longitude: 31.324,
    ownerEmail: 'maintenance2@demo.com',
    ownerPassword: 'demo123',
    rating: 4.7,
  },
  {
    id: 'shop-maint-maadi',
    name: 'Maadi Motors Care',
    nameAr: 'ماادي موتورز للصيانة',
    type: 'maintenance',
    areaId: 'maadi',
    address: 'Road 232, Maadi',
    addressAr: 'الطريق 232، المعادي',
    phone: '+201088990011',
    latitude: 29.967,
    longitude: 31.249,
    ownerEmail: 'maintenance3@demo.com',
    ownerPassword: 'demo123',
    rating: 4.5,
  },
  {
    id: 'shop-winch-maadi',
    name: 'Maadi Rescue Winch',
    nameAr: 'ونش إنقاذ المعادي',
    type: 'maintenance',
    areaId: 'maadi',
    address: 'Road 9, Maadi',
    addressAr: 'طريق 9، المعادي',
    phone: '+201010101010',
    latitude: 29.9612,
    longitude: 31.2575,
    ownerEmail: 'maintenance-winch@demo.com',
    ownerPassword: 'demo123',
    rating: 4.8,
  },
  {
    id: 'shop-winch-nasr',
    name: 'Nasr City Tow Service',
    nameAr: 'خدمة ونش مدينة نصر',
    type: 'maintenance',
    areaId: 'nasr-city',
    address: 'Makram Ebeid, Nasr City',
    addressAr: 'مكرم عبيد، مدينة نصر',
    phone: '+201020202020',
    latitude: 30.0566,
    longitude: 31.3433,
    ownerEmail: 'maintenance-winch2@demo.com',
    ownerPassword: 'demo123',
    rating: 4.6,
  },
  {
    id: 'shop-parts-nasr',
    name: 'Nasr Auto Parts',
    nameAr: 'قطع غيار مدينة نصر',
    type: 'parts',
    areaId: 'nasr-city',
    address: 'Suez Road, Nasr City',
    addressAr: 'طريق السويس، مدينة نصر',
    phone: '+201033445566',
    latitude: 30.059,
    longitude: 31.338,
    ownerEmail: 'parts@demo.com',
    ownerPassword: 'demo123',
    rating: 4.4,
  },
  {
    id: 'shop-parts-maadi',
    name: 'Maadi Spare Parts Hub',
    nameAr: 'مركز قطع غيار المعادي',
    type: 'parts',
    areaId: 'maadi',
    address: 'Degla Square',
    addressAr: 'ميدان دجلة',
    phone: '+201044556677',
    latitude: 29.955,
    longitude: 31.262,
    ownerEmail: 'parts2@demo.com',
    ownerPassword: 'demo123',
    rating: 4.6,
  },
];

export function getShopById(id: string): Shop | undefined {
  return DEMO_SHOPS.find((s) => s.id === id);
}

export function getShopByOwnerEmail(email: string): Shop | undefined {
  const normalized = email.trim().toLowerCase();
  return DEMO_SHOPS.find((s) => s.ownerEmail.toLowerCase() === normalized);
}

export function authenticateShopOwner(email: string, password: string): Shop | null {
  const shop = getShopByOwnerEmail(email);
  if (!shop) return null;
  if (shop.ownerPassword !== password.trim()) return null;
  return shop;
}

export function listShopsByType(type: ShopType): Shop[] {
  return DEMO_SHOPS.filter((s) => s.type === type);
}

export function listShopsByTypeAndArea(type: ShopType, areaId: string): Shop[] {
  return DEMO_SHOPS.filter((s) => s.type === type && s.areaId === areaId);
}

export function countShopsByTypeAndArea(type: ShopType, areaId: string): number {
  return listShopsByTypeAndArea(type, areaId).length;
}

export function listAreasWithShops(type: ShopType): string[] {
  const ids = new Set<string>();
  for (const s of DEMO_SHOPS) {
    if (s.type === type) ids.add(s.areaId);
  }
  return [...ids];
}
