export type UserVehicleRow = {
  id: number;
  catalog_car_id: number;
  nickname: string | null;
  current_odometer: number;
  created_at: string;
  brand: string;
  model: string;
  variant: string | null;
};

export type CatalogServiceWithState = {
  catalog_service_id: number;
  service_key: string;
  label: string;
  interval_km: number | null;
  interval_months: number | null;
  notes: string | null;
  last_done_odometer: number | null;
  last_done_at: string | null;
};

export type GarageSnapshotV1 = {
  v: 1;
  vehicles: Array<{
    catalog_car_id: number;
    nickname: string | null;
    current_odometer: number;
    services: Array<{
      catalog_service_id: number;
      last_done_odometer: number | null;
      last_done_at: string | null;
    }>;
  }>;
};
