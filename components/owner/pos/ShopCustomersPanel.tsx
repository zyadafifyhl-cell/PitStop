import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listShopCustomers } from '@/lib/posRepository';
import type { ShopPosCustomer } from '@/lib/posTypes';

type Props = {
  shopId: string;
  refreshKey?: number;
};

export function ShopCustomersPanel({ shopId, refreshKey }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ShopPosCustomer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listShopCustomers(shopId, query));
    } finally {
      setLoading(false);
    }
  }, [shopId, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);

  return (
    <OwnerSectionCard theme={theme} title={t('pos_crm_title')} subtitle={t('pos_crm_lead')}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('pos_crm_search')}
        placeholderTextColor={theme.textDim}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated, textAlign: isRTL ? 'right' : 'left' },
        ]}
      />
      {loading ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 10 }} /> : null}
      {rows.length === 0 && !loading ? (
        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('pos_crm_empty')}</Text>
      ) : (
        rows.map((customer) => (
          <View key={customer.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.name, { color: theme.text }]}>{customer.fullName || customer.phone}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {customer.phone}
              {customer.licensePlate ? ` · ${customer.licensePlate}` : ''}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {t('pos_crm_visits').replace('{count}', String(customer.totalVisits))}
              {customer.lastVisitAt
                ? ` · ${new Date(customer.lastVisitAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB')}`
                : ''}
            </Text>
          </View>
        ))
      )}
      <Pressable onPress={() => void load()} style={[styles.refresh, { borderColor: theme.border }]}>
        <Text style={[styles.refreshText, { color: theme.text }]}>{t('pos_crm_refresh')}</Text>
      </Pressable>
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  refresh: { borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  refreshText: { fontSize: 13, fontWeight: '700' },
});
