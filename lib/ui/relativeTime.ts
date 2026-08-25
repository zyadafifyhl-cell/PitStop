import type { Locale } from '@/lib/i18n/strings';

/** Compact relative timestamp for merchant notification rows. */
export function formatRelativeTimeAgo(iso: string, locale: Locale): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (locale === 'ar') {
    if (seconds < 45) return 'الآن';
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} د`;
    if (seconds < 86400) return `${Math.max(1, Math.floor(seconds / 3600))} س`;
    return `${Math.max(1, Math.floor(seconds / 86400))} ي`;
  }

  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`;
  if (seconds < 86400) return `${Math.max(1, Math.floor(seconds / 3600))}h ago`;
  return `${Math.max(1, Math.floor(seconds / 86400))}d ago`;
}
