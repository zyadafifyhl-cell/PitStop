import type { Locale } from '@/lib/i18n/strings';
import { phoneLookupVariants } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase/client';

export type CustomerLocaleLookup = {
  customerId?: string;
  customerPhone: string;
};

function normalizeLocale(value: unknown): Locale | null {
  return value === 'ar' || value === 'en' ? value : null;
}

/** Egypt-market default when no stored preference exists. */
export function inferLocaleFromPhone(phone: string): Locale {
  const trimmed = phone.trim();
  if (!trimmed) return 'en';
  if (trimmed.startsWith('+20') || trimmed.startsWith('20') || /^01[0125]\d{8}$/.test(trimmed)) {
    return 'ar';
  }
  return 'en';
}

function lookupKey(input: CustomerLocaleLookup): string {
  return input.customerId?.trim() || `phone:${input.customerPhone.trim()}`;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return message.includes(columnName.toLowerCase()) || (error as { code?: string })?.code === '42703';
}

async function fetchLocalesByUserIds(userIds: string[]): Promise<Map<string, Locale>> {
  const map = new Map<string, Locale>();
  const supabase = getSupabase();
  if (!supabase || !userIds.length) return map;

  const { data, error } = await supabase
    .from('users')
    .select('id, phone, preferred_locale')
    .in('id', userIds);

  if (error) {
    if (!isMissingColumnError(error, 'preferred_locale')) {
      console.warn('fetchLocalesByUserIds:', error.message);
    }
    return map;
  }

  for (const row of data ?? []) {
    const locale =
      normalizeLocale((row as { preferred_locale?: string | null }).preferred_locale) ??
      inferLocaleFromPhone(String((row as { phone?: string | null }).phone ?? ''));
    map.set(String((row as { id: string }).id), locale);
  }
  return map;
}

async function fetchLocaleByPhone(phone: string): Promise<Locale | null> {
  const supabase = getSupabase();
  if (!supabase || !phone.trim()) return null;

  const variants = phoneLookupVariants(phone);
  if (!variants.length) return null;

  const { data, error } = await supabase
    .from('users')
    .select('phone, preferred_locale')
    .in('phone', variants)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (!isMissingColumnError(error, 'preferred_locale')) {
      console.warn('fetchLocaleByPhone:', error.message);
    }
    return null;
  }

  if (!data) return null;
  return (
    normalizeLocale((data as { preferred_locale?: string | null }).preferred_locale) ??
    inferLocaleFromPhone(String((data as { phone?: string | null }).phone ?? phone))
  );
}

export async function resolveCustomerLocale(input: CustomerLocaleLookup): Promise<Locale> {
  if (input.customerId?.trim()) {
    const byId = await fetchLocalesByUserIds([input.customerId.trim()]);
    const resolved = byId.get(input.customerId.trim());
    if (resolved) return resolved;
  }

  const byPhone = await fetchLocaleByPhone(input.customerPhone);
  if (byPhone) return byPhone;

  return inferLocaleFromPhone(input.customerPhone);
}

export async function resolveCustomerLocalesBatch(
  customers: CustomerLocaleLookup[],
): Promise<Map<string, Locale>> {
  const result = new Map<string, Locale>();
  if (!customers.length) return result;

  const userIds = [
    ...new Set(customers.map((row) => row.customerId?.trim()).filter((value): value is string => !!value)),
  ];
  const localesByUserId = await fetchLocalesByUserIds(userIds);

  const phoneOnlyCustomers = customers.filter((row) => !row.customerId?.trim());
  const phoneLocaleCache = new Map<string, Locale>();
  await Promise.all(
    phoneOnlyCustomers.map(async (row) => {
      const key = lookupKey(row);
      if (phoneLocaleCache.has(key)) return;
      const resolved = (await fetchLocaleByPhone(row.customerPhone)) ?? inferLocaleFromPhone(row.customerPhone);
      phoneLocaleCache.set(key, resolved);
    }),
  );

  for (const customer of customers) {
    const key = lookupKey(customer);
    if (customer.customerId?.trim()) {
      const fromUser = localesByUserId.get(customer.customerId.trim());
      if (fromUser) {
        result.set(key, fromUser);
        continue;
      }
    }
    result.set(
      key,
      phoneLocaleCache.get(key) ?? inferLocaleFromPhone(customer.customerPhone),
    );
  }

  return result;
}

export async function syncCustomerPreferredLocaleRemote(
  userId: string,
  locale: Locale,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !userId.trim()) return;

  const { error } = await supabase
    .from('users')
    .update({ preferred_locale: locale, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error && !isMissingColumnError(error, 'preferred_locale')) {
    console.warn('syncCustomerPreferredLocaleRemote:', error.message);
  }
}
