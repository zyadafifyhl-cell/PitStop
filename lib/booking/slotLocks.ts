import { emitDataChange } from '@/lib/data/dataChanges';
import { getSupabase } from '@/lib/supabase/client';

export type SlotLock = {
  id: string;
  shopId: string;
  branchId: string;
  slotStartMs: number;
  /** null means every bay in the slot is closed. */
  blockedBays: number | null;
};

type SlotLockRow = {
  id: string;
  shop_id: string;
  branch_id: string;
  slot_start: string;
  blocked_bays: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRow(row: SlotLockRow): SlotLock {
  return {
    id: row.id,
    shopId: row.shop_id,
    branchId: row.branch_id,
    slotStartMs: new Date(row.slot_start).getTime(),
    blockedBays: row.blocked_bays,
  };
}

function dayBoundsIso(dateYmd: string): { from: string; to: string } | null {
  const start = new Date(`${dateYmd}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function listSlotLocksForDay(branchId: string | undefined, dateYmd: string): Promise<SlotLock[]> {
  const supabase = getSupabase();
  const bounds = dayBoundsIso(dateYmd);
  if (!supabase || !branchId || !UUID_RE.test(branchId) || !bounds) return [];
  const { data, error } = await supabase
    .from('shop_slot_locks')
    .select('id, shop_id, branch_id, slot_start, blocked_bays')
    .eq('branch_id', branchId)
    .gte('slot_start', bounds.from)
    .lt('slot_start', bounds.to);
  if (error || !data) return [];
  return (data as SlotLockRow[]).map(mapRow);
}

export async function lockSlot(input: {
  shopId: string;
  branchId: string;
  slotStartIso: string;
  blockedBays?: number | null;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase unavailable');
  const { error } = await supabase.from('shop_slot_locks').upsert(
    {
      shop_id: input.shopId,
      branch_id: input.branchId,
      slot_start: input.slotStartIso,
      blocked_bays: input.blockedBays ?? null,
    },
    { onConflict: 'branch_id,slot_start' },
  );
  if (error) throw new Error(error.message);
  emitDataChange('bookings');
}

export async function unlockSlot(lockId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase unavailable');
  const { error } = await supabase.from('shop_slot_locks').delete().eq('id', lockId);
  if (error) throw new Error(error.message);
  emitDataChange('bookings');
}

/** Bays the shop closed inside the 30-minute block that starts at `blockStartMs`. */
export function lockedBaysInBlock(locks: SlotLock[], blockStartMs: number, totalBays: number): number {
  const blockEnd = blockStartMs + 30 * 60_000;
  let blocked = 0;
  for (const lock of locks) {
    const lockEnd = lock.slotStartMs + 30 * 60_000;
    if (lock.slotStartMs < blockEnd && lockEnd > blockStartMs) {
      blocked += Math.min(totalBays, lock.blockedBays ?? totalBays);
    }
  }
  return Math.min(blocked, totalBays);
}
