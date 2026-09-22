import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { StoreProductForm } from '@/components/store/admin/StoreProductForm';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { listStoreProducts, setStoreProductActive } from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';

export default function AdminStoreProductsScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { isAdmin } = useShopAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listStoreProducts({ includeInactive: true });
      setProducts(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [isAdmin, refresh]);

  if (!isAdmin) return null;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
      </Pressable>

      <OwnerSectionCard theme={theme} title={t('store_admin_title')} subtitle={t('store_admin_lead')}>
        <StoreProductForm onSaved={() => void refresh()} />
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('store_admin_catalog_title')} subtitle={t('store_admin_catalog_lead')}>
        {loading ? <ActivityIndicator color={theme.accent} /> : null}
        {!loading && products.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>{t('store_admin_catalog_empty')}</Text>
        ) : null}
        {products.map((product) => (
          <View key={product.id} style={[styles.productRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: theme.text }]}>{product.name}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                {formatEgp(product.price, locale)} · {t('store_admin_stock_value').replace('{count}', String(product.stockQuantity))}
              </Text>
            </View>
            <Pressable
              onPress={() => void setStoreProductActive(product.id, !product.isActive).then(() => refresh())}
              style={[styles.toggleBtn, { borderColor: product.isActive ? theme.danger : theme.accent }]}>
              <Text style={{ color: product.isActive ? theme.danger : theme.accent, fontWeight: '800', fontSize: 12 }}>
                {product.isActive ? t('store_admin_deactivate') : t('store_admin_activate')}
              </Text>
            </Pressable>
          </View>
        ))}
      </OwnerSectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 12 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 14, fontWeight: '700' },
  productRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  productName: { fontSize: 15, fontWeight: '800' },
  toggleBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
});
