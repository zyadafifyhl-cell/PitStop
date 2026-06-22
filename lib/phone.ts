const EGYPT_MOBILE_RE = /^01[0125]\d{8}$/;

export function isValidEgyptMobile(raw: string): boolean {
  return EGYPT_MOBILE_RE.test(raw.trim().replace(/[\s-]/g, ''));
}

/**
 * Normalize Egypt mobile inputs to E.164 (+20…).
 * UI should still ask users for local 11-digit numbers like 01012345678.
 */
export function normalizePhoneE164(raw: string): string | null {
  let s = raw.trim().replace(/[\s-]/g, '');
  if (!s) return null;

  if (!EGYPT_MOBILE_RE.test(s)) return null;
  return `+20${s.slice(1)}`;
}
