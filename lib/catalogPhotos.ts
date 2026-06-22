/**
 * Illustrative stock photography per catalog row (stable URL per brand|model).
 * Images are from Unsplash (license: https://unsplash.com/license) — not OEM photos.
 */
const POOL = [
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1494976388531-d085849596cc?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1511910849309-0dffb5665733?w=960&q=80&auto=format&fit=max',
  'https://images.unsplash.com/photo-1523980355278-02beecd37afb?w=960&q=80&auto=format&fit=max',
];

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Stable illustrative hero image for a catalog vehicle (not manufacturer artwork). */
export function photoUrlForCatalogCar(brand: string, model: string): string {
  const key = `${brand.trim()}|${model.trim()}`;
  return POOL[hashKey(key) % POOL.length];
}
