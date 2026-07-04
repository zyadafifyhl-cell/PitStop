/** Auto-generated body when a customer taps stars on My bookings (Talabat-style). */
export const ORDER_HISTORY_REVIEW_BODY_EN = 'Rated from order history.';
export const ORDER_HISTORY_REVIEW_BODY_AR = 'تقييم من سجل الحجوزات.';

const ORDER_HISTORY_BODIES = new Set([ORDER_HISTORY_REVIEW_BODY_EN, ORDER_HISTORY_REVIEW_BODY_AR]);

export function orderHistoryReviewBody(locale: 'en' | 'ar'): string {
  return locale === 'ar' ? ORDER_HISTORY_REVIEW_BODY_AR : ORDER_HISTORY_REVIEW_BODY_EN;
}

export function isOrderHistoryReview(body: string): boolean {
  return ORDER_HISTORY_BODIES.has(body.trim());
}
