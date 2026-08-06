import { STORE_VEHICLE_BRANDS } from '@/lib/store/constants';
import type { ParsedVehicleIdentity, StoreProduct, StoreProductCompatibility } from '@/lib/store/types';

export function parseVehicleMakeModel(makeModel: string): ParsedVehicleIdentity {
  const trimmed = makeModel.trim();
  const yearMatch = /^(\d{4})\s+(.+)$/.exec(trimmed);
  if (!yearMatch) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    return {
      brand: tokens[0],
      model: tokens.slice(1).join(' ') || tokens[0],
    };
  }

  const year = Number(yearMatch[1]);
  const rest = yearMatch[2].trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const brand = tokens[0];
  const model = tokens.slice(1).join(' ') || brand;
  return { year, brand, model };
}

function normalizeToken(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function yearInRange(year: number | undefined, start?: number, end?: number): boolean {
  if (!year) return true;
  if (start != null && year < start) return false;
  if (end != null && year > end) return false;
  return true;
}

function rowMatchesVehicle(row: StoreProductCompatibility, vehicle: ParsedVehicleIdentity): boolean {
  const brand = normalizeToken(vehicle.brand);
  const model = normalizeToken(vehicle.model);
  const rowBrand = normalizeToken(row.brand);
  const rowModel = normalizeToken(row.model);

  if (rowBrand && rowBrand !== brand) return false;
  if (rowModel && rowModel !== model) return false;
  return yearInRange(vehicle.year, row.yearStart, row.yearEnd);
}

export function productMatchesVehicle(product: StoreProduct, vehicle: ParsedVehicleIdentity | null): boolean {
  if (!vehicle?.brand) return product.compatibilityType === 'universal';
  if (product.compatibilityType === 'universal') return true;

  if (product.compatibilityType === 'brand_specific') {
    return product.compatibility.some((row) => normalizeToken(row.brand) === normalizeToken(vehicle.brand));
  }

  if (product.compatibilityType === 'model_specific') {
    return product.compatibility.some((row) => rowMatchesVehicle(row, vehicle));
  }

  return false;
}

/** Skip strict filtering when the active vehicle label cannot be parsed into a real make/model. */
export function hasReliableVehicleIdentity(vehicle: ParsedVehicleIdentity | null): boolean {
  if (!vehicle?.brand?.trim()) return false;
  const brand = vehicle.brand.trim().toLowerCase();
  if (vehicle.year && vehicle.year >= 1980 && vehicle.year <= 2035) return true;
  return STORE_VEHICLE_BRANDS.some((known) => known.toLowerCase() === brand);
}

export function filterProductsByVehicleCompatibility(
  products: StoreProduct[],
  vehicle: ParsedVehicleIdentity | null,
  onlyCompatible: boolean,
): StoreProduct[] {
  if (!onlyCompatible) return products;
  if (!hasReliableVehicleIdentity(vehicle)) return products;
  return products.filter((product) => productMatchesVehicle(product, vehicle));
}

export function resolveProductCompatibilityBadge(
  product: StoreProduct,
  vehicle: ParsedVehicleIdentity | null,
): 'universal' | 'fits' | null {
  if (product.compatibilityType === 'universal') return 'universal';
  if (vehicle && productMatchesVehicle(product, vehicle)) return 'fits';
  return null;
}
