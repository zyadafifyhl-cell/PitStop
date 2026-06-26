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

/** Local 11-digit, E.164, and raw variants for booking lookups. */
export function phoneLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  if (trimmed.startsWith('+20')) {
    variants.add(`0${trimmed.slice(3)}`);
  }

  const local = trimmed.startsWith('+20') ? `0${trimmed.slice(3)}` : trimmed;
  const e164 = normalizePhoneE164(local);
  if (e164) variants.add(e164);

  return [...variants];
}

export function phonesEqual(a: string, b: string): boolean {
  const left = phoneLookupVariants(a);
  const right = phoneLookupVariants(b);
  return left.some((value) => right.includes(value));
}
