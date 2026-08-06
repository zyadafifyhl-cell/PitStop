import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { setShopStoreGlobalDiscount } from '@/lib/booking/shopExtrasStorage';
import type { Shop, ShopExtras } from '@/lib/booking/types';
import { storeProductCategoryForShopType } from '@/lib/booking/storeCatalog';
import {
  hasStoreProductDiscount,
  resolveStoreProductEffectivePrice,
} from '@/lib/store/pricing';
import {
  listStoreProductsByCategory,
  updateStoreProductFields,
} from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';

type DraftRow = {
  price: string;
  salePrice: string;
  stock: string;
};

type Props = {
  shop: Shop;
  shopExtras: ShopExtras | null;
  onExtrasChange: (extras: ShopExtras) => void;
  mode?: 'all' | 'inventory' | 'discounts';
};

function parseMoneyInput(raw: string): number | null {
  const value = Number(raw.replace(/,/g, '').trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function parseStockInput(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function StoreOwnerAdminPanel({ shop, shopExtras, onExtrasChange, mode = 'all' }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const category = storeProductCategoryForShopType(shop.type);

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [globalDiscount, setGlobalDiscount] = useState(
    String(shopExtras?.storeGlobalDiscountPercent ?? 0),
  );

  const globalDiscountPercent = useMemo(() => {
    const value = Number(globalDiscount);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }, [globalDiscount]);

  const refresh = useCallback(async () => {
    if (!category) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listStoreProductsByCategory(category, { includeInactive: true });
      setProducts(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              price: String(row.price),
              salePrice: row.salePrice != null ? String(row.salePrice) : '',
              stock: String(row.stockQuantity),
            },
          ]),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setGlobalDiscount(String(shopExtras?.storeGlobalDiscountPercent ?? 0));
  }, [shopExtras?.storeGlobalDiscountPercent]);

  async function persistProduct(productId: string, patch: Parameters<typeof updateStoreProductFields>[1]) {
    setSavingId(productId);
    try {
      const ok = await updateStoreProductFields(productId, patch);
      if (ok) await refresh();
    } finally {
      setSavingId(null);
    }
  }

  async function saveDraftRow(product: StoreProduct) {
    const draft = drafts[product.id];
    if (!draft) return;
    const price = parseMoneyInput(draft.price);
    const stock = parseStockInput(draft.stock);
    const saleRaw = draft.salePrice.trim();
    const salePrice = saleRaw ? parseMoneyInput(saleRaw) : null;
    if (price == null || stock == null || (saleRaw && salePrice == null)) return;

    await persistProduct(product.id, {
      price,
      stockQuantity: stock,
      salePrice: salePrice != null && salePrice < price ? salePrice : null,
    });
  }

  async function adjustStock(product: StoreProduct, delta: number) {
    const next = Math.max(0, product.stockQuantity + delta);
    setDrafts((prev) => ({
      ...prev,
      [product.id]: { ...prev[product.id], stock: String(next) },
    }));
    await persistProduct(product.id, { stockQuantity: next });
  }

  async function saveGlobalDiscount() {
    const next = await setShopStoreGlobalDiscount(shop.id, globalDiscountPercent);
    onExtrasChange(next);
  }

  function updateDraft(productId: string, key: keyof DraftRow, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [key]: value },
    }));
  }

  const fieldStyle = [
    styles.input,
    compact && styles.inputCompact,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <>
      {mode === 'all' || mode === 'inventory' ? (
      <OwnerSectionCard
        theme={theme}
        title={t('store_owner_inventory_title')}
        subtitle={t('store_owner_inventory_lead')}>
        {loading ? <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} /> : null}
        {!loading && products.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('store_owner_inventory_empty')}</Text>
        ) : null}

        {products.map((product) => {
          const draft = drafts[product.id];
          const effective = resolveStoreProductEffectivePrice(product, globalDiscountPercent);
          const discounted = hasStoreProductDiscount(product, globalDiscountPercent);
          const busy = savingId === product.id;

          return (
            <View
              key={product.id}
              style={[
                styles.productCard,
                compact && styles.productCardCompact,
                { borderColor: theme.border, backgroundColor: theme.bgElevated },
              ]}>
              <View style={styles.productHead}>
                <View style={styles.productTitleWrap}>
                  {product.imageUrl ? (
                    <Image source={{ uri: product.imageUrl }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: theme.card }]}>
                      <FontAwesome name="cube" size={18} color={theme.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.productName, compact && styles.productNameCompact, { color: theme.text }]} numberOfLines={2}>
                      {product.name}
                    </Text>
                    {discounted ? (
                      <Text style={[styles.pricePreview, { color: theme.accent }]}>
                        {formatEgp(effective, locale)}{' '}
                        <Text style={[styles.priceStrike, { color: theme.textDim }]}>
                          {formatEgp(product.price, locale)}
                        </Text>
                      </Text>
                    ) : (
                      <Text style={[styles.pricePreview, { color: theme.textMuted }]}>
                        {formatEgp(product.price, locale)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.activeRow}>
                  <Text style={[styles.activeLabel, { color: theme.textMuted }]}>
                    {product.isActive ? t('store_owner_visible') : t('store_owner_hidden')}
                  </Text>
                  <Switch
                    value={product.isActive}
                    disabled={busy}
                    onValueChange={(value) => void persistProduct(product.id, { isActive: value })}
                    trackColor={{ false: theme.border, true: theme.accentSoft }}
                    thumbColor={product.isActive ? theme.accent : theme.textDim}
                  />
                </View>
              </View>

              <View style={[styles.fieldGrid, compact && styles.fieldGridCompact]}>
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: theme.textDim }]}>{t('store_owner_price_label')}</Text>
                  <TextInput
                    value={draft?.price ?? ''}
                    onChangeText={(value) => updateDraft(product.id, 'price', value)}
                    onBlur={() => void saveDraftRow(product)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.textDim}
                    style={fieldStyle}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: theme.textDim }]}>{t('store_owner_sale_price_label')}</Text>
                  <TextInput
                    value={draft?.salePrice ?? ''}
                    onChangeText={(value) => updateDraft(product.id, 'salePrice', value)}
                    onBlur={() => void saveDraftRow(product)}
                    keyboardType="decimal-pad"
                    placeholder={t('store_owner_sale_price_ph')}
                    placeholderTextColor={theme.textDim}
                    style={fieldStyle}
                  />
                </View>

                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: theme.textDim }]}>{t('store_owner_stock_label')}</Text>
                  <View style={styles.stockRow}>
                    <Pressable
                      onPress={() => void adjustStock(product, -1)}
                      disabled={busy || product.stockQuantity <= 0}
                      style={[styles.stockBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
                      <Text style={[styles.stockBtnText, { color: theme.text }]}>−</Text>
                    </Pressable>
                    <TextInput
                      value={draft?.stock ?? ''}
                      onChangeText={(value) => updateDraft(product.id, 'stock', value)}
                      onBlur={() => void saveDraftRow(product)}
                      keyboardType="number-pad"
                      style={[fieldStyle, styles.stockInput]}
                    />
                    <Pressable
                      onPress={() => void adjustStock(product, 1)}
                      disabled={busy}
                      style={[styles.stockBtn, { borderColor: theme.accent, backgroundColor: theme.accent }]}>
                      <Text style={[styles.stockBtnText, { color: theme.onAccent }]}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} /> : null}
            </View>
          );
        })}
      </OwnerSectionCard>
      ) : null}

      {mode === 'all' || mode === 'discounts' ? (
      <OwnerSectionCard
        theme={theme}
        title={t('store_owner_discounts_title')}
        subtitle={t('store_owner_discounts_lead')}>
        <Text style={[styles.fieldLabel, { color: theme.textDim }]}>{t('store_owner_global_discount_label')}</Text>
        <TextInput
          value={globalDiscount}
          onChangeText={setGlobalDiscount}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.textDim}
          style={fieldStyle}
        />
        <Text style={[styles.hint, { color: theme.textMuted }]}>{t('store_owner_global_discount_hint')}</Text>
        <Pressable onPress={() => void saveGlobalDiscount()} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.saveBtnText, { color: theme.onAccent }]}>{t('store_owner_save_discounts')}</Text>
        </Pressable>
      </OwnerSectionCard>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  productCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  productCardCompact: { padding: 12 },
  productHead: { gap: 10 },
  productTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  productNameCompact: { fontSize: 13, lineHeight: 17 },
  pricePreview: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  priceStrike: { textDecorationLine: 'line-through', fontWeight: '600' },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activeLabel: { fontSize: 12, fontWeight: '700' },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldGridCompact: { flexDirection: 'column' },
  fieldBlock: { flexGrow: 1, flexBasis: '30%', minWidth: 140 },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  inputCompact: { paddingVertical: 10, fontSize: 14 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockBtnText: { fontSize: 22, fontWeight: '800', lineHeight: 24 },
  stockInput: { flex: 1, textAlign: 'center', marginTop: 0 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  saveBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '800' },
});
