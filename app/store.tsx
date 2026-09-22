import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoreCartCheckoutModal } from '@/components/store/StoreCartCheckoutModal';
import { StoreProductCard } from '@/components/store/StoreProductCard';
import { StoreSearchHeader } from '@/components/store/StoreSearchHeader';
import { StoreSubCategoryPills } from '@/components/store/StoreSubCategoryPills';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { fetchShopByIdRemote, getShopById } from '@/lib/booking/catalogRepository';
import { storeProductCategoryForShopType } from '@/lib/booking/storeCatalog';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import type { Shop } from '@/lib/booking/types';
import { STORE_SUB_CATEGORIES } from '@/lib/store/constants';
import { listStoreProductsByShop } from '@/lib/store/productRepository';
import type { StoreProduct, StoreProductCategory } from '@/lib/store/types';
import { getStoreGridLayout } from '@/lib/ui/storeGridLayout';

function discoveryHrefForCategory(category?: string): '/service/parts' | '/service/accessories' {
  return category === 'accessories' ? '/service/accessories' : '/service/parts';
}

export default function StoreScreen() {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const grid = useMemo(() => getStoreGridLayout(screenWidth), [screenWidth]);
  const { customer } = useCustomerAuth();
  const { items, addProduct, setQuantity, refresh: refreshCart } = useStoreCart();
  const params = useLocalSearchParams<{ category?: string | string[]; shopId?: string | string[] }>();
  const routeCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const routeShopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

  const [shop, setShop] = useState<Shop | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopLoading, setShopLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [subCategory, setSubCategory] = useState<string | 'all'>('all');
  const [cartOpen, setCartOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Legacy `/store?category=…` without shopId → area discovery (no global catalog).
  useEffect(() => {
    if (routeShopId) return;
    router.replace(discoveryHrefForCategory(routeCategory));
  }, [routeShopId, routeCategory]);

  const productCategory: StoreProductCategory = useMemo(() => {
    if (shop) {
      return storeProductCategoryForShopType(shop.type) ?? 'spare_parts';
    }
    return routeCategory === 'accessories' ? 'accessories' : 'spare_parts';
  }, [shop, routeCategory]);

  const shopName = shop ? (locale === 'ar' ? shop.nameAr || shop.name : shop.name) : '';
  const shopAddress = shop
    ? locale === 'ar'
      ? shop.addressAr || shop.address
      : shop.address
    : '';
  const categoryLabel =
    productCategory === 'accessories' ? t('store_cat_accessories') : t('store_cat_parts');
  const headerSubtitle = [shopAddress, categoryLabel].filter(Boolean).join(' · ');

  const shopCartItems = useMemo(
    () => items.filter((row) => row.product?.shopId === routeShopId),
    [items, routeShopId],
  );
  const shopItemCount = useMemo(
    () => shopCartItems.reduce((sum, row) => sum + row.quantity, 0),
    [shopCartItems],
  );

  const loadShop = useCallback(async () => {
    if (!routeShopId) {
      setShop(null);
      setCoverUrl(undefined);
      setAvatarUrl(undefined);
      setShopLoading(false);
      return;
    }
    setShopLoading(true);
    try {
      let next = getShopById(routeShopId) ?? null;
      if (!next) next = await fetchShopByIdRemote(routeShopId);
      setShop(next);
      const extras = await getShopExtras(routeShopId);
      setCoverUrl(extras.imageUrls?.[0]?.trim() || undefined);
      setAvatarUrl(extras.profileImageUrl?.trim() || extras.imageUrls?.[0]?.trim() || undefined);
    } finally {
      setShopLoading(false);
    }
  }, [routeShopId]);

  const loadProducts = useCallback(async () => {
    if (!routeShopId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listStoreProductsByShop(routeShopId, { includeInactive: false });
      // Hard scope: never show another merchant's SKUs; stamp shopId for cart/checkout.
      setProducts(
        rows
          .filter((row) => row.isActive && (!row.shopId || row.shopId === routeShopId))
          .map((row) => ({ ...row, shopId: routeShopId })),
      );
    } finally {
      setLoading(false);
    }
  }, [routeShopId]);

  useEffect(() => {
    void loadShop();
    void loadProducts();
  }, [loadShop, loadProducts]);

  useFocusEffect(
    useCallback(() => {
      setSubCategory('all');
      setQuery('');
      void refreshCart();
      void loadProducts();
    }, [refreshCart, loadProducts]),
  );

  /** Sub-category pills only for SKUs present in this shop's inventory. */
  const availableSubCategories = useMemo(() => {
    const present = new Set(products.map((row) => row.subCategory).filter(Boolean));
    const catalogOrder = STORE_SUB_CATEGORIES[productCategory].map((row) => row.id);
    const ordered = catalogOrder.filter((id) => present.has(id));
    const extras = [...present].filter((id) => !catalogOrder.includes(id));
    return [...ordered, ...extras];
  }, [products, productCategory]);

  const filteredProducts = useMemo(() => {
    let rows = products;
    if (subCategory !== 'all') {
      rows = rows.filter((row) => row.subCategory === subCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          (row.description ?? '').toLowerCase().includes(q) ||
          row.subCategory.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [products, subCategory, query]);

  const handleInventoryChanged = useCallback(() => {
    void loadProducts();
  }, [loadProducts]);

  async function onAddToCart(product: StoreProduct) {
    if (!customer?.id) {
      router.push('/auth-required');
      return;
    }
    if (!routeShopId || product.shopId !== routeShopId) return;
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
    if (!customer?.id) {
      router.push('/auth-required');
      return;
    }
    if (!routeShopId || product.shopId !== routeShopId) return;
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

  if (!routeShopId) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
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

      {coverUrl || avatarUrl ? (
        <View style={[styles.brandHero, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: theme.accentSoft }]} />
          )}
          {avatarUrl ? (
            <View
              style={[
                styles.avatarWrap,
                isRTL ? styles.avatarWrapRtl : styles.avatarWrapLtr,
                { borderColor: theme.card, backgroundColor: theme.card },
              ]}>
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            </View>
          ) : null}
        </View>
      ) : null}

      <StoreSearchHeader
        title={shopLoading && !shopName ? t('store_title') : shopName || t('store_title')}
        subtitle={headerSubtitle || t('store_subtitle')}
        query={query}
        onChangeQuery={setQuery}
        cartCount={shopItemCount}
        onOpenCart={() => {
          if (!customer?.id) {
            router.push('/auth-required');
            return;
          }
          setCartOpen(true);
          void refreshCart();
          void loadProducts();
        }}
      />

      <StoreSubCategoryPills
        category={productCategory}
        value={subCategory}
        onChange={setSubCategory}
        availableSubCategories={availableSubCategories}
      />

      {loading || shopLoading ? <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} /> : null}
      {!loading && !shopLoading && filteredProducts.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('store_empty')}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <FlatList
        key={`store-grid-${routeShopId}-${grid.columns}`}
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
            fillRow
            adding={addingId === item.id}
            cartQuantity={items.find((row) => row.productId === item.id)?.quantity ?? 0}
            onAddToCart={() => void onAddToCart(item)}
            onChangeQuantity={(next) => void onChangeQuantity(item, next)}
          />
        )}
      />

      <StoreCartCheckoutModal
        visible={cartOpen}
        preferredShopId={routeShopId}
        onClose={() => setCartOpen(false)}
        onInventoryChanged={handleInventoryChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', gap: 12 },
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
  brandHero: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 4,
  },
  cover: { width: '100%', height: 120 },
  avatarWrap: {
    position: 'absolute',
    bottom: 10,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    overflow: 'hidden',
  },
  avatarWrapLtr: { left: 14 },
  avatarWrapRtl: { right: 14 },
  avatar: { width: '100%', height: '100%' },
  gridRow: { alignItems: 'stretch' },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24, marginBottom: 8 },
});
