import * as SQLite from 'expo-sqlite';

import { EGYPT_CATALOG } from '@/lib/egyptCatalog';

import type { CatalogServiceWithState, GarageSnapshotV1, UserVehicleRow } from '@/lib/storage.types';

export type { CatalogServiceWithState, GarageSnapshotV1, UserVehicleRow } from '@/lib/storage.types';

const DB_NAME = 'pitstop.db';
const SCHEMA_VERSION = 1;

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await dbInstance.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(dbInstance);
  return dbInstance;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS catalog_car (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      variant TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_service (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_car_id INTEGER NOT NULL REFERENCES catalog_car(id) ON DELETE CASCADE,
      service_key TEXT NOT NULL,
      label TEXT NOT NULL,
      interval_km INTEGER,
      interval_months INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS user_vehicle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalog_car_id INTEGER NOT NULL REFERENCES catalog_car(id),
      nickname TEXT,
      current_odometer INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_service_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicle(id) ON DELETE CASCADE,
      catalog_service_id INTEGER NOT NULL REFERENCES catalog_service(id),
      last_done_odometer INTEGER,
      last_done_at TEXT,
      UNIQUE(user_vehicle_id, catalog_service_id)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_car_brand ON catalog_car(brand);
    CREATE INDEX IF NOT EXISTS idx_user_vehicle_car ON user_vehicle(catalog_car_id);
  `);

  const row = await db.getFirstAsync<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  const current = row?.version ?? 0;

  if (current < SCHEMA_VERSION) {
    await seedCatalogIfNeeded(db);
    await db.runAsync(
      'INSERT INTO schema_migrations (version) VALUES (?);',
      SCHEMA_VERSION,
    );
  }
}

async function seedCatalogIfNeeded(db: SQLite.SQLiteDatabase) {
  const count = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM catalog_car',
  );
  if (count && count.c > 0) return;

  await db.withTransactionAsync(async () => {
    for (const car of EGYPT_CATALOG) {
      const res = await db.runAsync(
        `INSERT INTO catalog_car (brand, model, variant, notes)
         VALUES (?, ?, ?, ?);`,
        car.brand,
        car.model,
        car.variant ?? null,
        car.notes ?? null,
      );
      const catalogCarId = res.lastInsertRowId;

      for (const svc of car.services) {
        await db.runAsync(
          `INSERT INTO catalog_service
           (catalog_car_id, service_key, label, interval_km, interval_months, notes)
           VALUES (?, ?, ?, ?, ?, ?);`,
          catalogCarId,
          svc.serviceKey,
          svc.label,
          svc.intervalKm,
          svc.intervalMonths,
          svc.notes ?? null,
        );
      }
    }
  });
}

export async function searchCatalogCars(query: string) {
  const db = await getDb();
  const q = `%${query.trim()}%`;
  return db.getAllAsync<{
    id: number;
    brand: string;
    model: string;
    variant: string | null;
    notes: string | null;
  }>(
    `SELECT id, brand, model, variant, notes FROM catalog_car
     WHERE brand LIKE ? OR model LIKE ? OR IFNULL(variant,'') LIKE ?
     ORDER BY brand, model`,
    q,
    q,
    q,
  );
}

export async function listCatalogCars(limit = 500) {
  const db = await getDb();
  return db.getAllAsync<{
    id: number;
    brand: string;
    model: string;
    variant: string | null;
    notes: string | null;
  }>(
    `SELECT id, brand, model, variant, notes FROM catalog_car
     ORDER BY brand, model LIMIT ?`,
    limit,
  );
}

export async function getCatalogCar(id: number) {
  const db = await getDb();
  return db.getFirstAsync<{
    id: number;
    brand: string;
    model: string;
    variant: string | null;
    notes: string | null;
  }>('SELECT id, brand, model, variant, notes FROM catalog_car WHERE id = ?;', id);
}

export async function listUserVehicles(): Promise<UserVehicleRow[]> {
  const db = await getDb();
  return db.getAllAsync<UserVehicleRow>(
    `SELECT uv.id, uv.catalog_car_id, uv.nickname, uv.current_odometer, uv.created_at,
            cc.brand, cc.model, cc.variant
     FROM user_vehicle uv
     JOIN catalog_car cc ON cc.id = uv.catalog_car_id
     ORDER BY uv.created_at DESC`,
  );
}

export async function addUserVehicle(catalogCarId: number, nickname: string | null) {
  const db = await getDb();
  let userVehicleId = 0;

  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO user_vehicle (catalog_car_id, nickname, current_odometer)
       VALUES (?, ?, 0);`,
      catalogCarId,
      nickname,
    );

    userVehicleId = res.lastInsertRowId;

    const services = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM catalog_service WHERE catalog_car_id = ?;',
      catalogCarId,
    );

    for (const s of services) {
      await db.runAsync(
        `INSERT INTO user_service_state (user_vehicle_id, catalog_service_id)
         VALUES (?, ?);`,
        userVehicleId,
        s.id,
      );
    }
  });

  return userVehicleId;
}

export async function updateOdometer(userVehicleId: number, km: number) {
  const db = await getDb();
  await db.runAsync('UPDATE user_vehicle SET current_odometer = ? WHERE id = ?;', km, userVehicleId);
}

export async function deleteUserVehicle(userVehicleId: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM user_vehicle WHERE id = ?;', userVehicleId);
}

export async function getVehicleServices(userVehicleId: number): Promise<CatalogServiceWithState[]> {
  const db = await getDb();
  return db.getAllAsync<CatalogServiceWithState>(
    `SELECT cs.id AS catalog_service_id, cs.service_key, cs.label,
            cs.interval_km, cs.interval_months, cs.notes,
            uss.last_done_odometer, uss.last_done_at
     FROM user_service_state uss
     JOIN catalog_service cs ON cs.id = uss.catalog_service_id
     WHERE uss.user_vehicle_id = ?
     ORDER BY cs.label`,
    userVehicleId,
  );
}

export async function markServiceDone(userVehicleId: number, catalogServiceId: number, odometer: number) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE user_service_state
     SET last_done_odometer = ?, last_done_at = datetime('now')
     WHERE user_vehicle_id = ? AND catalog_service_id = ?;`,
    odometer,
    userVehicleId,
    catalogServiceId,
  );
}

export async function clearServiceDone(userVehicleId: number, catalogServiceId: number) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE user_service_state
     SET last_done_odometer = NULL, last_done_at = NULL
     WHERE user_vehicle_id = ? AND catalog_service_id = ?;`,
    userVehicleId,
    catalogServiceId,
  );
}

export async function clearUserGarage() {
  const db = await getDb();
  await db.runAsync('DELETE FROM user_vehicle;');
}

export async function exportGarageSnapshot(): Promise<GarageSnapshotV1> {
  const vehicles = await listUserVehicles();
  const blocks: GarageSnapshotV1['vehicles'] = [];
  for (const v of vehicles) {
    const svc = await getVehicleServices(v.id);
    blocks.push({
      catalog_car_id: v.catalog_car_id,
      nickname: v.nickname,
      current_odometer: v.current_odometer,
      services: svc.map((s) => ({
        catalog_service_id: s.catalog_service_id,
        last_done_odometer: s.last_done_odometer,
        last_done_at: s.last_done_at,
      })),
    });
  }
  return { v: 1, vehicles: blocks };
}

export async function importGarageSnapshot(data: GarageSnapshotV1) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM user_vehicle;');
    for (const block of data.vehicles) {
      const res = await db.runAsync(
        `INSERT INTO user_vehicle (catalog_car_id, nickname, current_odometer)
         VALUES (?, ?, ?);`,
        block.catalog_car_id,
        block.nickname,
        block.current_odometer,
      );
      const userVehicleId = res.lastInsertRowId;

      const services = await db.getAllAsync<{ id: number }>(
        'SELECT id FROM catalog_service WHERE catalog_car_id = ?;',
        block.catalog_car_id,
      );

      for (const s of services) {
        await db.runAsync(
          `INSERT INTO user_service_state (user_vehicle_id, catalog_service_id)
           VALUES (?, ?);`,
          userVehicleId,
          s.id,
        );
      }

      for (const patch of block.services) {
        await db.runAsync(
          `UPDATE user_service_state
           SET last_done_odometer = ?, last_done_at = ?
           WHERE user_vehicle_id = ? AND catalog_service_id = ?;`,
          patch.last_done_odometer,
          patch.last_done_at,
          userVehicleId,
          patch.catalog_service_id,
        );
      }
    }
  });
}
