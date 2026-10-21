import type { Booking } from '@/lib/booking/types';

export const AUTO_COMPLETE_BUFFER_MINUTES = 15;
export const DEFAULT_SERVICE_DURATION_MINUTES = 45;

export type BookingCompletionType = 'manual' | 'auto';

export type BookingProgressSnapshot = {
  durationMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  totalMinutes: number;
  isOverdue: boolean;
};

export function resolveBookingDurationMinutes(booking: Pick<Booking, 'serviceDurationMinutes'>): number {
  const duration = booking.serviceDurationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES;
  return Math.max(5, Math.round(duration));
}

export function computeExpectedCompletionAt(
  startedAt: Date | string,
  durationMinutes: number,
  bufferMinutes = AUTO_COMPLETE_BUFFER_MINUTES,
): string {
  const startMs = new Date(startedAt).getTime();
  return new Date(startMs + (durationMinutes + bufferMinutes) * 60_000).toISOString();
}

export function bookingProgressSnapshot(booking: Booking, now = Date.now()): BookingProgressSnapshot | null {
  if (booking.status !== 'in_progress') return null;
  const durationMinutes = resolveBookingDurationMinutes(booking);
  const startedMs = booking.startedAt ? new Date(booking.startedAt).getTime() : now;
  const expectedMs = booking.expectedCompletionAt
    ? new Date(booking.expectedCompletionAt).getTime()
    : startedMs + (durationMinutes + AUTO_COMPLETE_BUFFER_MINUTES) * 60_000;
  const totalMinutes = Math.max(1, Math.round((expectedMs - startedMs) / 60_000));
  const elapsedMinutes = Math.max(0, Math.round((now - startedMs) / 60_000));
  const remainingMinutes = Math.max(0, Math.round((expectedMs - now) / 60_000));
  return {
    durationMinutes,
    elapsedMinutes: Math.min(elapsedMinutes, totalMinutes + 180),
    remainingMinutes,
    totalMinutes,
    isOverdue: now >= expectedMs,
  };
}

export function isBookingDueForAutoComplete(booking: Booking, now = Date.now()): boolean {
  if (booking.status !== 'in_progress') return false;
  if (!booking.expectedCompletionAt) return false;
  const dueMs = new Date(booking.expectedCompletionAt).getTime();
  return !Number.isNaN(dueMs) && dueMs <= now;
}
