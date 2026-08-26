import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { AddProductModal } from '@/components/store/owner/AddProductModal';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { storeProductCategoryForShopType } from '@/lib/booking/storeCatalog';
import type { Shop } from '@/lib/booking/types';
import { STORE_LOW_STOCK_MAX, isStoreLowStock } from '@/lib/store/constants';
import { primaryProductImageUrl } from '@/lib/store/productImages';
import type { StoreInventoryListFilter } from '@/lib/store/ownerFilters';
import {
  deleteStoreProduct,
  listStoreProductsByShop,
  updateStoreProductFields,
} from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';
import { getSupabase } from '@/lib/supabase/client';
import { userConfirm } from '@/lib/ui/userAlert';

type Props = {
  shop: Shop;
  onRefresh?: () => void;
  stockFilter?: StoreInventoryListFilter;
  onStockFilterChange?: (filter: StoreInventoryListFilter) => void;
};

type ProductDraft = {
  price: string;
  salePrice: string;
  stock: string;
};

const draftFor = (product: StoreProduct): ProductDraft => ({
  price: String(product.price),
  salePrice: product.salePrice == null ? '' : String(product.salePrice),
  stock: String(product.stockQuantity),
});

export function StoreInventoryManager({ shop, onRefresh, stockFilter, onStockFilterChange }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const useCssGrid = Platform.OS === 'web' && width >= 700;
  const gridStyle = useCssGrid
    ? ({
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        width: '100%',
        alignItems: 'start',
        justifyItems: 'stretch',
      } as const)
    : styles.stackGrid;
  const category = storeProductCategoryForShopType(shop.type);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [localStockFilter, setLocalStockFilter] = useState<StoreInventoryListFilter>(stockFilter ?? 'all');

  useEffect(() => {
    if (stockFilter) setLocalStockFilter(stockFilter);
  }, [stockFilter]);

  const activeStockFilter = stockFilter ?? localStockFilter;
  const setActiveStockFilter = useCallback(
    (next: StoreInventoryListFilter) => {
      setLocalStockFilter(next);
      onStockFilterChange?.(next);
    },
    [onStockFilterChange],
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const rows = await listStoreProductsByShop(shop.id, { includeInactive: true });
    setProducts(rows);
    setDrafts(Object.fromEntries(rows.map((product) => [product.id, draftFor(product)])));
    setLoading(false);
  }, [shop.id]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`store-inventory:${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `shop_id=eq.${shop.id}` },
        () => void loadProducts(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProducts, shop.id]);

  const updateDraft = useCallback((productId: string, patch: Partial<ProductDraft>) => {
    setDrafts((current) => ({
      ...current,
      [productId]: { ...current[productId], ...patch },
    }));
  }, []);

  const adjustStock = useCallback((productId: string, delta: number) => {
    setDrafts((current) => {
      const draft = current[productId];
      if (!draft) return current;
      const stock = Math.max(0, (Number.parseInt(draft.stock, 10) || 0) + delta);
      return { ...current, [productId]: { ...draft, stock: String(stock) } };
    });
  }, []);

  const saveProduct = useCallback(async (product: StoreProduct) => {
    const draft = drafts[product.id];
    if (!draft) return;
    const price = Number(draft.price);
    const salePrice = draft.salePrice.trim() ? Number(draft.salePrice) : null;
    const stockQuantity = Number(draft.stock);
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_invalid_price'));
      return;
    }
    if (salePrice != null && (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > price)) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_invalid_sale_price'));
      return;
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_invalid_stock'));
      return;
    }

    setBusyId(product.id);
    const saved = await updateStoreProductFields(product.id, { price, salePrice, stockQuantity });
    setBusyId(null);
    if (!saved) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_save_failed'));
      return;
    }
    setEditingId(null);
    await loadProducts();
    onRefresh?.();
  }, [drafts, loadProducts, onRefresh, t]);

  const toggleActive = useCallback(async (product: StoreProduct, value: boolean) => {
    setBusyId(product.id);
    await updateStoreProductFields(product.id, { isActive: value });
    setBusyId(null);
    await loadProducts();
    onRefresh?.();
  }, [loadProducts, onRefresh]);

  const removeProduct = useCallback(async (product: StoreProduct) => {
    const confirmed = await userConfirm(
      t('store_owner_delete_product'),
      t('store_owner_delete_product_confirm').replace('{product}', product.name),
      { confirmLabel: t('store_owner_delete_product'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;
    setBusyId(product.id);
    const deleted = await deleteStoreProduct(product.id, shop.id);
    setBusyId(null);
    if (!deleted) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_save_failed'));
      return;
    }
    await loadProducts();
    onRefresh?.();
  }, [loadProducts, onRefresh, shop.id, t]);

  const onProductCreated = useCallback(async () => {
    setAddOpen(false);
    await loadProducts();
    onRefresh?.();
  }, [loadProducts, onRefresh]);

  const visibleProducts = useMemo(
    () =>
      activeStockFilter === 'low_stock'
        ? products.filter((product) => isStoreLowStock(product.stockQuantity))
        : products,
    [activeStockFilter, products],
  );
  const lowStockCount = useMemo(
    () => products.filter((product) => isStoreLowStock(product.stockQuantity)).length,
    [products],
  );

  const cards = useMemo(
    () => visibleProducts.map((product) => {
      const draft = drafts[product.id] ?? draftFor(product);
      const editing = editingId === product.id;
      const busy = busyId === product.id;
      const lowStock = isStoreLowStock(product.stockQuantity);
      const coverUrl = primaryProductImageUrl(product);

      return (
        <View
          key={product.id}
          style={[styles.productCard, { backgroundColor: '#111928', borderColor: '#1f2a3c' }]}>
          <View style={styles.productHeader}>
            <View>
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.productImage} contentFit="cover" />
              ) : (
                <View style={[styles.productImage, styles.imagePlaceholder, { backgroundColor: '#0f172a' }]}>
                  <FontAwesome name="image" size={22} color={theme.textDim} />
                </View>
              )}
              {(product.imageUrls?.length ?? 0) > 1 ? (
                <View style={styles.imageCountBadge}>
                  <Text style={styles.imageCountText}>{product.imageUrls.length}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.productIdentity}>
              <Text style={[styles.productName, { color: theme.text }]} numberOfLines={2}>{product.name}</Text>
              <Text style={[styles.category, { color: theme.textMuted }]}>{product.subCategory}</Text>
            </View>
            {lowStock ? (
              <View style={[styles.lowStockBadge, { backgroundColor: theme.dangerSoft }]}>
                <Text style={{ color: theme.danger, fontSize: 11, fontWeight: '800' }}>{t('store_owner_low_stock')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.priceGrid}>
            <LabeledMoneyInput
              label={t('store_owner_price')}
              value={draft.price}
              editable={editing}
              onChangeText={(value) => updateDraft(product.id, { price: value })}
            />
            <LabeledMoneyInput
              label={t('store_owner_sale_price')}
              value={draft.salePrice}
              editable={editing}
              placeholder={t('store_owner_optional')}
              onChangeText={(value) => updateDraft(product.id, { salePrice: value })}
            />
          </View>

          <View style={[styles.controlRow, { borderTopColor: '#334155' }]}>
            <View style={styles.controlSection}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_stock')}</Text>
              <View style={[styles.stockPill, { backgroundColor: '#0f172a', borderColor: '#334155' }]}>
                <Pressable
                  disabled={!editing || busy}
                  onPress={() => adjustStock(product.id, -1)}
                  style={({ pressed }) => [styles.stockButton, { opacity: !editing || busy ? 0.35 : pressed ? 0.7 : 1 }]}>
                  <FontAwesome name="minus" size={13} color={theme.text} />
                </Pressable>
                <TextInput
                  editable={editing && !busy}
                  value={draft.stock}
                  onChangeText={(value) => updateDraft(product.id, { stock: value })}
                  keyboardType="number-pad"
                  style={[styles.stockInput, { color: lowStock ? theme.danger : theme.text }]}
                />
                <Pressable
                  disabled={!editing || busy}
                  onPress={() => adjustStock(product.id, 1)}
                  style={({ pressed }) => [styles.stockButton, { opacity: !editing || busy ? 0.35 : pressed ? 0.7 : 1 }]}>
                  <FontAwesome name="plus" size={13} color={theme.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.statusSection}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_active')}</Text>
              <View style={styles.switchLine}>
                <Text style={[styles.visibilityText, { color: product.isActive ? theme.success : theme.textDim }]}>
                  {product.isActive ? t('store_owner_visible') : t('store_owner_hidden')}
                </Text>
                <Switch
                  value={product.isActive}
                  onValueChange={(value) => void toggleActive(product, value)}
                  disabled={busy}
                  trackColor={{ false: '#475569', true: theme.successSoft }}
                  thumbColor={product.isActive ? theme.success : '#94a3b8'}
                />
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            {editing ? (
              <>
                <Pressable
                  onPress={() => {
                    updateDraft(product.id, draftFor(product));
                    setEditingId(null);
                  }}
                  style={[styles.secondaryAction, { borderColor: '#475569' }]}>
                  <Text style={[styles.actionText, { color: theme.text }]}>{t('alert_cancel')}</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => void saveProduct(product)}
                  style={[styles.primaryAction, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
                  {busy ? <ActivityIndicator color={theme.onAccent} /> : (
                    <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_manage_save_profile')}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setEditingId(product.id)}
                  style={[styles.secondaryAction, { borderColor: '#475569' }]}>
                  <FontAwesome name="pencil" size={13} color={theme.accent} />
                  <Text style={[styles.actionText, { color: theme.accent }]}>{t('store_owner_edit_product')}</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  onPress={() => void removeProduct(product)}
                  style={[styles.deleteAction, { borderColor: theme.danger }]}>
                  <FontAwesome name="trash" size={13} color={theme.danger} />
                  <Text style={[styles.actionText, { color: theme.danger }]}>{t('store_owner_delete_product')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    }),
    [adjustStock, busyId, drafts, editingId, removeProduct, saveProduct, t, theme, toggleActive, updateDraft, visibleProducts],
  );

  return (
    <View style={styles.page}>
      <OwnerSectionCard
        title={t('store_owner_inventory')}
        subtitle={t('store_owner_inventory_lead')}
        icon="cubes">
        <View style={styles.filterRow}>
          {(
            [
              { id: 'all' as const, label: t('store_inventory_filter_all'), count: products.length },
              {
                id: 'low_stock' as const,
                label: t('store_inventory_filter_low_stock').replace('{count}', String(STORE_LOW_STOCK_MAX)),
                count: lowStockCount,
              },
            ]
          ).map((pill) => {
            const active = activeStockFilter === pill.id;
            return (
              <Pressable
                key={pill.id}
                onPress={() => setActiveStockFilter(pill.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={[styles.filterPillText, { color: active ? theme.onAccent : theme.text }]}>
                  {pill.label} ({pill.count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.toolbar}>
          <Text style={[styles.count, { color: theme.textMuted }]}>
            {visibleProducts.length} {t('store_owner_total_products')}
          </Text>
          {category ? (
            <Pressable
              onPress={() => setAddOpen(true)}
              style={[styles.addButton, { backgroundColor: theme.accent }]}>
              <FontAwesome name="plus" size={13} color={theme.onAccent} />
              <Text style={[styles.addButtonText, { color: theme.onAccent }]}>{t('store_owner_add_product')}</Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.accent} size="large" /></View>
        ) : products.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
              <FontAwesome name="cubes" size={30} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('store_owner_no_products')}</Text>
            {category ? (
              <Pressable onPress={() => setAddOpen(true)} style={[styles.addButton, { backgroundColor: theme.accent }]}>
                <FontAwesome name="plus" size={13} color={theme.onAccent} />
                <Text style={[styles.addButtonText, { color: theme.onAccent }]}>{t('store_owner_add_first_product')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : visibleProducts.length === 0 ? (
          <Text style={[styles.emptyTitle, { color: theme.textMuted, paddingVertical: 24 }]}>
            {t('store_owner_no_low_stock')}
          </Text>
        ) : (
          <View style={gridStyle}>{cards}</View>
        )}
      </OwnerSectionCard>

      <AddProductModal
        visible={addOpen}
        shopId={shop.id}
        category={category}
        onClose={() => setAddOpen(false)}
        onCreated={() => void onProductCreated()}
      />
    </View>
  );
}

function LabeledMoneyInput({
  label,
  value,
  editable,
  placeholder = '0.00',
  onChangeText,
}: {
  label: string;
  value: string;
  editable: boolean;
  placeholder?: string;
  onChangeText: (value: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.priceField}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <View style={[styles.moneyInputWrap, { backgroundColor: '#0f172a', borderColor: '#475569' }]}>
        <TextInput
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.textDim}
          style={[styles.moneyInput, { color: theme.text, opacity: editable ? 1 : 0.78 }]}
        />
        <Text style={[styles.currency, { color: theme.textMuted }]}>EGP</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  count: { fontSize: 12, fontWeight: '700' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButtonText: { fontSize: 13, fontWeight: '900' },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { maxWidth: 360, textAlign: 'center', fontSize: 15, lineHeight: 22, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'stretch', width: '100%' },
  stackGrid: { flexDirection: 'column', gap: 16, width: '100%' },
  productCard: {
    width: '100%',
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  productHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  productImage: { width: 62, height: 62, borderRadius: 12 },
  imageCountBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  imageCountText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productIdentity: { flex: 1, minWidth: 0 },
  productName: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  category: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  lowStockBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  priceField: { flex: 1, minWidth: 130 },
  fieldLabel: { marginBottom: 7, fontSize: 11, fontWeight: '800' },
  moneyInputWrap: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  moneyInput: { flex: 1, height: 42, minWidth: 0, paddingHorizontal: 11, fontSize: 14, fontWeight: '700' },
  currency: { paddingRight: 10, fontSize: 11, fontWeight: '900' },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 18,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  controlSection: { flex: 1, minWidth: 156 },
  statusSection: { flex: 1, minWidth: 170 },
  stockPill: {
    width: 150,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
  stockButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stockInput: { flex: 1, minWidth: 42, height: 38, textAlign: 'center', fontSize: 14, fontWeight: '900', padding: 0 },
  switchLine: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  visibilityText: { fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  secondaryAction: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  primaryAction: { minWidth: 100, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  deleteAction: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  actionText: { fontSize: 12, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '88%', borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { fontSize: 19, fontWeight: '900' },
  modalBody: { padding: 18 },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 15, fontSize: 14 },
  uploadDropzone: {
    minHeight: 154,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    marginBottom: 16,
  },
  uploadIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  uploadTitle: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  uploadHint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  previewCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  imagePreview: { width: '100%', height: 176 },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    bottom: 48,
    backgroundColor: 'rgba(2,6,23,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadingText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  previewActions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 10 },
  imageActionButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  imageActionText: { fontSize: 11, fontWeight: '900' },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modalGridItem: { flex: 1, minWidth: 180 },
  modalActions: { flexDirection: 'row', gap: 10, padding: 18, borderTopWidth: 1, borderTopColor: '#334155' },
  modalButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
