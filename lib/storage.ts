/**
 * TypeScript resolves `@/lib/storage` here. Metro prefers `storage.native.ts` /
 * `storage.web.ts` when bundling, so this file is not shipped at runtime.
 */
export type { CatalogServiceWithState, GarageSnapshotV1, UserVehicleRow } from './storage.types';
export {
  getDb,
  searchCatalogCars,
  listCatalogCars,
  getCatalogCar,
  listUserVehicles,
  addUserVehicle,
  updateOdometer,
  deleteUserVehicle,
  getVehicleServices,
  markServiceDone,
  clearServiceDone,
  clearUserGarage,
  exportGarageSnapshot,
  importGarageSnapshot,
} from './storage.native';
