export const DEFAULT_TOTAL_BAYS = 3;
export const DEFAULT_SLOT_DURATION_MINUTES = 30;
export const DEFAULT_OPENING_TIME = '09:00';
export const DEFAULT_CLOSING_TIME = '22:00';
export const SLOT_DURATION_OPTIONS = [30, 45, 60] as const;
export type SlotDurationOption = (typeof SLOT_DURATION_OPTIONS)[number];

export function formatPgTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function clampSlotDuration(value: number | null | undefined): SlotDurationOption {
  if (value != null && value <= 30) return 30;
  if (value != null && value <= 45) return 45;
  if (value != null && value >= 60) return 60;
  return DEFAULT_SLOT_DURATION_MINUTES;
}

export function clampTotalBays(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOTAL_BAYS;
  return Math.max(1, Math.min(50, Math.round(Number(value))));
}
