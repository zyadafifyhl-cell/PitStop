import type { CatalogServiceWithState } from '@/lib/storage.types';

export type DueBand = 'unknown' | 'ok' | 'soon' | 'due' | 'km_only';

export type ServiceUiRow = CatalogServiceWithState & {
  nextDueKm: number | null;
  remainingKm: number | null;
  band: DueBand;
  /** Percent of maintenance interval consumed since last logged service (0–100). */
  intervalPctUsed: number | null;
};

const SOON_KM = 1000;

export function computeServiceRows(
  currentOdometer: number,
  rows: CatalogServiceWithState[],
): ServiceUiRow[] {
  return rows.map((row) => {
    const intervalKm = row.interval_km;

    if (intervalKm == null) {
      return {
        ...row,
        nextDueKm: null,
        remainingKm: null,
        band: 'km_only' as const,
        intervalPctUsed: null,
      };
    }

    if (row.last_done_odometer == null) {
      return {
        ...row,
        nextDueKm: null,
        remainingKm: null,
        band: 'unknown' as const,
        intervalPctUsed: null,
      };
    }

    const baseline = row.last_done_odometer;
    const nextDueKm = baseline + intervalKm;
    const remainingKm = nextDueKm - currentOdometer;
    const driven = currentOdometer - baseline;
    const intervalPctUsed = Math.min(100, Math.max(0, (driven / intervalKm) * 100));

    if (remainingKm <= 0) {
      return {
        ...row,
        nextDueKm,
        remainingKm,
        band: 'due' as const,
        intervalPctUsed,
      };
    }

    if (remainingKm <= SOON_KM) {
      return {
        ...row,
        nextDueKm,
        remainingKm,
        band: 'soon' as const,
        intervalPctUsed,
      };
    }

    return {
      ...row,
      nextDueKm,
      remainingKm,
      band: 'ok' as const,
      intervalPctUsed,
    };
  });
}
