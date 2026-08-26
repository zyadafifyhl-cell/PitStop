import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { StoreCartCheckoutModal } from '@/components/store/StoreCartCheckoutModal';
import { StoreProductCard } from '@/components/store/StoreProductCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { shopSupportsInShopStore } from '@/lib/booking/storeCatalog';
import type { ShopType } from '@/lib/booking/types';
import { listStoreProductsByShop } from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';

type Props = {
  shopId: string;
  shopType: ShopType;
  shopName?: string;
};

export function ShopProfileStoreSection({ shopId, shopType, shopName }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { customer, isGuest } = useCustomerAuth();
  const { items, addProduct, setQuantity, refresh: refreshCart } = useStoreCart();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const supported = shopSupportsInShopStore(shopType);
  const shopCartItems = items.filter((row) => row.product?.shopId === shopId);
  const shopItemCount = shopCartItems.reduce((sum, row) => sum + row.quantity, 0);
  const isDesktop = width >= 768;
  const useCssGrid = Platform.OS === 'web';

  const gridStyle = useMemo(() => {
    if (useCssGrid) {
      return {
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
        gap: isDesktop ? 20 : 12,
        width: '100%',
        alignItems: 'start',
        justifyItems: 'stretch',
      } as Record<string, string | number>;
    }
    return styles.flexGrid;
  }, [isDesktop, useCssGrid]);

  const cellStyle = useCssGrid ? styles.gridCell : styles.flexCell;

  const loadProducts = useCallback(async () => {
    if (!supported || !shopId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const rows = await listStoreProductsByShop(shopId);
    setProducts(rows.filter((row) => row.isActive && row.stockQuantity > 0));
    setLoading(false);
  }, [shopId, supported]);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();
      void refreshCart();
    }, [loadProducts, refreshCart]),
  );

  if (!supported) return null;

  async function onAddToCart(product: StoreProduct) {
    if (!customer?.id || isGuest) {
      router.push('/auth-required');
      return;
    }
    if (product.stockQuantity <= 0) return;
    const current = items.find((row) => row.productId === product.id)?.quantity ?? 0;
    if (current >= product.stockQuantity) return;
    setAddingId(product.id);
    try {
      const ok = await addProduct(product, 1);
      if (!ok) {
        Alert.alert(t('store_checkout_fail_title'), t('store_cart_add_fail_body'));
      }
    } finally {
      setAddingId(null);
    }
  }

  async function onChangeQuantity(product: StoreProduct, next: number) {
    if (!customer?.id || isGuest) {
      router.push('/auth-required');
      return;
    }
    const row = items.find((item) => item.productId === product.id);
    setAddingId(product.id);
    try {
      if (!row) {
        if (next > 0) await addProduct(product, next);
        return;
      }
      await setQuantity(row.id, next);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_store_title')}</Text>
          <Text style={[styles.sectionLead, { color: theme.textMuted }]}>{t('shop_profile_store_lead')}</Text>
        </View>
        {shopItemCount > 0 ? (
          <Pressable
            onPress={() => {
              if (!customer?.id || isGuest) {
                router.push('/auth-required');
                return;
              }
              setCartOpen(true);
              void refreshCart();
            }}
            style={[styles.cartChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.cartChipText, { color: theme.accent }]}>
              {t('store_cart_title')} ({shopItemCount})
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 12 }} /> : null}

      {!loading && products.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('shop_profile_store_empty')}</Text>
      ) : null}

      {!loading && products.length > 0 ? (
        <View style={[styles.gridShell, gridStyle]}>
          {products.map((product) => (
            <View key={product.id} style={cellStyle}>
              <StoreProductCard
                product={product}
                compact
                imageHeight={180}
                imageFit="contain"
                adding={addingId === product.id}
                cartQuantity={items.find((row) => row.productId === product.id)?.quantity ?? 0}
                onAddToCart={() => void onAddToCart(product)}
                onChangeQuantity={(next) => void onChangeQuantity(product, next)}
              />
            </View>
          ))}
        </View>
      ) : null}

      {products.length > 0 ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/store',
              params: { shopId },
            })
          }
          style={[styles.viewAllBtn, { borderColor: theme.border }]}>
          <Text style={[styles.viewAllText, { color: theme.accent }]}>
            {shopName ? t('store_view_products') : t('store_view_products')}
          </Text>
        </Pressable>
      ) : null}

      <StoreCartCheckoutModal
        visible={cartOpen}
        preferredShopId={shopId}
        onClose={() => setCartOpen(false)}
        onInventoryChanged={() => {
          void loadProducts();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    gap: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  sectionLead: { fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  gridShell: {
    width: '100%',
    alignSelf: 'stretch',
  },
  flexGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    width: '100%',
  },
  gridCell: {
    minWidth: 0,
    maxWidth: '100%',
  },
  flexCell: {
    width: '50%',
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  cartChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cartChipText: { fontSize: 12, fontWeight: '800' },
  viewAllBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  viewAllText: { fontSize: 14, fontWeight: '800' },
});
