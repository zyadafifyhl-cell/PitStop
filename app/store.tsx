import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoreCartCheckoutModal } from '@/components/store/StoreCartCheckoutModal';
import { StoreLocationListPanel } from '@/components/store/StoreLocationListPanel';
import { StoreLocationMapPanel } from '@/components/store/StoreLocationMapPanel';
import { StoreProductCard } from '@/components/store/StoreProductCard';
import { StoreSearchHeader } from '@/components/store/StoreSearchHeader';
import { StoreSubCategoryPills } from '@/components/store/StoreSubCategoryPills';
import { StoreViewToggle, type StoreViewMode } from '@/components/store/StoreViewToggle';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { STORE_SUB_CATEGORIES } from '@/lib/store/constants';
import { mergeStoreCatalogProducts } from '@/lib/store/demoProducts';
import { listStoreProducts } from '@/lib/store/productRepository';
import type { StoreProduct, StoreProductCategory } from '@/lib/store/types';
import { getStoreGridLayout } from '@/lib/ui/storeGridLayout';

function resolveRouteCategory(raw?: string): StoreProductCategory {
  return raw === 'accessories' ? 'accessories' : 'spare_parts';
}

export default function StoreScreen() {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const grid = useMemo(() => getStoreGridLayout(screenWidth), [screenWidth]);
  const { customer } = useCustomerAuth();
  const { itemCount, addProduct, refresh: refreshCart } = useStoreCart();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const routeCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const activeCategory = resolveRouteCategory(routeCategory);

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [subCategory, setSubCategory] = useState<string | 'all'>('all');
  const [viewMode, setViewMode] = useState<StoreViewMode>('products');
  const [cartOpen, setCartOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const shopType = activeCategory === 'accessories' ? 'accessories' : 'parts';
  const categoryTitle =
    activeCategory === 'accessories' ? t('store_accessories_title') : t('store_spare_parts_title');
  const subCategoryOptions = useMemo(
    () => STORE_SUB_CATEGORIES[activeCategory].map((row) => row.id),
    [activeCategory],
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const remote = await listStoreProducts();
      setProducts(mergeStoreCatalogProducts(remote));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      setSubCategory('all');
      setViewMode('products');
      void refreshCart();
    }, [routeCategory, refreshCart]),
  );

  const filteredProducts = useMemo(() => {
    let rows = products.filter((row) => row.category === activeCategory);

    if (subCategory !== 'all') {
      rows = rows.filter((row) => row.subCategory === subCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          (row.description ?? '').toLowerCase().includes(q) ||
          (row.sellerLabel ?? '').toLowerCase().includes(q) ||
          row.subCategory.toLowerCase().includes(q),
      );
    }

    return rows;
  }, [products, activeCategory, subCategory, query]);

  async function onAddToCart(product: StoreProduct) {
    if (!customer?.id) {
      router.push('/auth-required');
      return;
    }
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

  const header = (
    <View style={styles.headerBlock}>
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, isRTL && styles.backBtnRtl]}
        hitSlop={8}>
        <FontAwesome name={isRTL ? 'arrow-right' : 'arrow-left'} size={18} color={theme.accent} />
        <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
      </Pressable>

      <StoreSearchHeader
        query={query}
        onChangeQuery={setQuery}
        cartCount={itemCount}
        onOpenCart={() => {
          if (!customer?.id) {
            router.push('/auth-required');
            return;
          }
          setCartOpen(true);
        }}
      />

      <StoreViewToggle value={viewMode} onChange={setViewMode} />

      {viewMode === 'products' ? (
        <>
          <Text style={[styles.categoryTitle, { color: theme.text }, isRTL && styles.rtl]}>
            {categoryTitle}
          </Text>
          <StoreSubCategoryPills
            category={activeCategory}
            value={subCategory}
            onChange={setSubCategory}
            availableSubCategories={subCategoryOptions}
          />
          {loading ? <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} /> : null}
          {!loading && filteredProducts.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('store_empty')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      {viewMode === 'products' ? (
        <FlatList
          key={`store-grid-${grid.columns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          numColumns={grid.columns}
          columnWrapperStyle={grid.columns > 1 ? [styles.gridRow, { gap: grid.gap }] : undefined}
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: grid.horizontalPadding,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <StoreProductCard
              product={item}
              compact={grid.compact}
              adding={addingId === item.id}
              onAddToCart={() => void onAddToCart(item)}
            />
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: grid.horizontalPadding,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          keyboardShouldPersistTaps="handled">
          {header}
          {viewMode === 'list' ? <StoreLocationListPanel shopType={shopType} /> : null}
          {viewMode === 'map' ? <StoreLocationMapPanel shopType={shopType} active /> : null}
        </ScrollView>
      )}

      <StoreCartCheckoutModal visible={cartOpen} onClose={() => setCartOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 12 },
  headerBlock: { gap: 12, marginBottom: 8 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backBtnRtl: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  backText: { fontSize: 15, fontWeight: '800' },
  categoryTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  gridRow: { alignItems: 'stretch' },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24, marginBottom: 8 },
});
