import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeBookingMoney } from '@/lib/booking/reporting';
import { listShopReviews } from '@/lib/booking/reviewsStorage';
import type { Booking } from '@/lib/booking/types';
import type { WashAnalyticsSnapshot } from '@/lib/booking/wash/types';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export async function computeWashAnalytics(
  shopId: string,
  bookings: Booking[],
): Promise<WashAnalyticsSnapshot> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const shopBookings = bookings.filter((b) => b.shopId === shopId);
  const todayBookings = shopBookings.filter((b) => {
    const t = new Date(b.scheduledAt).getTime();
    return t >= todayStart.getTime() && t <= todayEnd.getTime() && b.status !== 'cancelled';
  }).length;

  const pendingRequests = shopBookings.filter((b) => b.status === 'pending').length;

  const monthlyRevenue = shopBookings
    .filter((b) => {
      const t = new Date(b.scheduledAt);
      return t >= monthStart && b.status !== 'cancelled' && b.status !== 'no_show';
    })
    .reduce((sum, b) => sum + normalizeBookingMoney(b).servicePriceEgp, 0);

  const weeklyRevenue = shopBookings
    .filter((b) => {
      const t = new Date(b.scheduledAt);
      return t >= weekStart && b.status !== 'cancelled' && b.status !== 'no_show';
    })
    .reduce((sum, b) => sum + normalizeBookingMoney(b).servicePriceEgp, 0);

  const customerPhones = new Set(
    shopBookings.filter((b) => b.status !== 'cancelled').map((b) => b.customerPhone),
  );
  const returningCustomers = shopBookings.reduce((acc, booking) => {
    const key = booking.customerPhone;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const returningCount = Object.values(returningCustomers).filter((n) => n > 1).length;

  const serviceCounts = shopBookings.reduce((acc, booking) => {
    const name = booking.serviceName || booking.carType;
    if (!name || booking.status === 'cancelled') return acc;
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostBookedService =
    Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const hourCounts = shopBookings.reduce((acc, booking) => {
    if (booking.status === 'cancelled') return acc;
    const hour = new Date(booking.scheduledAt).getHours();
    acc[hour] = (acc[hour] ?? 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  const peakHour = Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12);
  const peakHourLabel = `${String(peakHour).padStart(2, '0')}:00`;

  const bookingTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const label = day.toLocaleDateString('en-GB', { weekday: 'short' });
    const count = shopBookings.filter((b) => {
      const t = new Date(b.scheduledAt);
      return (
        t.getFullYear() === day.getFullYear() &&
        t.getMonth() === day.getMonth() &&
        t.getDate() === day.getDate() &&
        b.status !== 'cancelled'
      );
    }).length;
    return { label, count };
  });

  const reviews = await listShopReviews(shopId);
  const visibleReviews = reviews.filter((r) => !r.hidden);
  const averageRating =
    visibleReviews.length > 0
      ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / visibleReviews.length
      : 0;

  return {
    todayBookings,
    pendingRequests,
    monthlyRevenue,
    weeklyRevenue,
    averageRating,
    totalCustomers: customerPhones.size,
    mostBookedService,
    returningCustomers: returningCount,
    peakHourLabel,
    bookingTrend,
  };
}
