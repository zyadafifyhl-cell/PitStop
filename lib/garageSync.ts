import { exportGarageSnapshot, importGarageSnapshot } from '@/lib/storage';
import type { GarageSnapshotV1 } from '@/lib/storage.types';
import { getSupabase } from '@/lib/supabase/client';

function assertSnapshot(raw: unknown): asserts raw is GarageSnapshotV1 {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as GarageSnapshotV1).v !== 1 ||
    !Array.isArray((raw as GarageSnapshotV1).vehicles)
  ) {
    throw new Error('Invalid snapshot payload');
  }
}

/** Upload local garage JSON for the signed-in user (creates or replaces row). */
export async function uploadGarageSnapshot(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync is not configured');
  const snapshot = await exportGarageSnapshot();
  const { error } = await sb.from('garage_snapshots').upsert(
    {
      user_id: userId,
      snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/**
 * Replace local garage from cloud when a row exists.
 * @returns true if data was imported, false when no remote row yet.
 */
export async function downloadGarageSnapshot(userId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync is not configured');
  const { data, error } = await sb
    .from('garage_snapshots')
    .select('snapshot')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  const snap = data?.snapshot;
  if (snap == null) return false;

  assertSnapshot(snap);
  await importGarageSnapshot(snap);
  return true;
}
