import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { Shop } from '@/lib/booking/types';
import { storeProductCategoryForShopType } from '@/lib/booking/storeCatalog';
import {
  listStoreProductsByCategory,
  updateStoreProductFields,
} from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';

type Props = {
  shop: Shop;
  onRefresh?: () => void;
};

type EditingProduct = {
  id: string;
  price: string;
  salePrice: string;
  stock: string;
};

export function StoreInventoryManager({ shop, onRefresh }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const category = storeProductCategoryForShopType(shop.type);

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, EditingProduct>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!category) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const items = await listStoreProductsByCategory(category, { includeInactive: true });
      setProducts(items);
      
      // Initialize editing state
      const editState: Record<string, EditingProduct> = {};
      items.forEach((p) => {
        editState[p.id] = {
          id: p.id,
          price: String(p.price),
          salePrice: p.salePrice != null ? String(p.salePrice) : '',
          stock: String(p.stockQuantity),
        };
      });
      setEditing(editState);
    } catch (error) {
      console.error('[StoreInventoryManager] loadProducts error:', error);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSaveProduct = useCallback(
    async (productId: string) => {
      const product = products.find((p) => p.id === productId);
      const draft = editing[productId];
      if (!product || !draft) return;

      const price = parseFloat(draft.price);
      const salePrice = draft.salePrice ? parseFloat(draft.salePrice) : null;
      const stock = parseInt(draft.stock, 10);

      if (isNaN(price) || price < 0) {
        Alert.alert(t('error'), t('store_owner_invalid_price'));
        return;
      }

      if (salePrice != null && (isNaN(salePrice) || salePrice < 0 || salePrice > price)) {
        Alert.alert(t('error'), t('store_owner_invalid_sale_price'));
        return;
      }

      if (isNaN(stock) || stock < 0) {
        Alert.alert(t('error'), t('store_owner_invalid_stock'));
        return;
      }

      setSaving(productId);
      try {
        const success = await updateStoreProductFields(productId, {
          price,
          sale_price: salePrice,
          stock_quantity: stock,
        });

        if (success) {
          await loadProducts();
          onRefresh?.();
        } else {
          Alert.alert(t('error'), t('store_owner_save_failed'));
        }
      } catch (error) {
        console.error('[StoreInventoryManager] handleSaveProduct error:', error);
        Alert.alert(t('error'), t('store_owner_save_failed'));
      } finally {
        setSaving(null);
      }
    },
    [products, editing, loadProducts, onRefresh, t],
  );

  const handleToggleActive = useCallback(
    async (productId: string, isActive: boolean) => {
      setSaving(productId);
      try {
        const success = await updateStoreProductFields(productId, { is_active: isActive });
        if (success) {
          await loadProducts();
          onRefresh?.();
        }
      } catch (error) {
        console.error('[StoreInventoryManager] handleToggleActive error:', error);
      } finally {
        setSaving(null);
      }
    },
    [loadProducts, onRefresh],
  );

  const handleStockIncrement = useCallback(
    (productId: string, delta: number) => {
      setEditing((prev) => {
        const current = prev[productId];
        if (!current) return prev;
        const newStock = Math.max(0, parseInt(current.stock, 10) + delta);
        return {
          ...prev,
          [productId]: { ...current, stock: String(newStock) },
        };
      });
    },
    [],
  );

  if (loading) {
    return (
      <OwnerSectionCard title={t('store_owner_inventory')} icon="cubes">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </OwnerSectionCard>
    );
  }

  if (products.length === 0) {
    return (
      <OwnerSectionCard title={t('store_owner_inventory')} icon="cubes">
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          {t('store_owner_no_products')}
        </Text>
      </OwnerSectionCard>
    );
  }

  return (
    <OwnerSectionCard title={t('store_owner_inventory')} icon="cubes">
      {products.map((product) => {
        const draft = editing[product.id];
        if (!draft) return null;

        const hasChanges =
          draft.price !== String(product.price) ||
          draft.salePrice !== (product.salePrice != null ? String(product.salePrice) : '') ||
          draft.stock !== String(product.stockQuantity);

        const isSaving = saving === product.id;
        const lowStock = product.stockQuantity < 5;

        return (
          <View
            key={product.id}
            style={[
              styles.productRow,
              {
                backgroundColor: product.isActive ? 'transparent' : theme.surfaceVariant,
                borderBottomColor: theme.border,
              },
            ]}
          >
            {/* Product Image & Info */}
            <View style={styles.productInfo}>
              {product.imageUrl ? (
                <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
              ) : (
                <View style={[styles.productImagePlaceholder, { backgroundColor: theme.border }]}>
                  <FontAwesome name="image" size={20} color={theme.textSecondary} />
                </View>
              )}
              <View style={styles.productDetails}>
                <Text
                  style={[
                    styles.productName,
                    { color: theme.text },
                    !product.isActive && { color: theme.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {product.name}
                </Text>
                <Text style={[styles.productCategory, { color: theme.textSecondary }]}>
                  {product.subCategory}
                </Text>
              </View>
            </View>

            {/* Price Inputs */}
            <View style={styles.priceColumn}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {t('store_owner_price')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={draft.price}
                onChangeText={(text) =>
                  setEditing((prev) => ({
                    ...prev,
                    [product.id]: { ...prev[product.id], price: text },
                  }))
                }
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
              />

              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 8 }]}>
                {t('store_owner_sale_price')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    color: theme.error,
                    borderColor: theme.border,
                  },
                ]}
                value={draft.salePrice}
                onChangeText={(text) =>
                  setEditing((prev) => ({
                    ...prev,
                    [product.id]: { ...prev[product.id], salePrice: text },
                  }))
                }
                keyboardType="numeric"
                placeholder={t('store_owner_optional')}
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            {/* Stock Controls */}
            <View style={styles.stockColumn}>
              <Text style={[styles.label, { color: lowStock ? theme.error : theme.textSecondary }]}>
                {t('store_owner_stock')}
              </Text>
              <View style={styles.stockControls}>
                <Pressable
                  style={[styles.stockButton, { backgroundColor: theme.error }]}
                  onPress={() => handleStockIncrement(product.id, -1)}
                  disabled={isSaving}
                >
                  <FontAwesome name="minus" size={14} color="#fff" />
                </Pressable>
                <TextInput
                  style={[
                    styles.stockInput,
                    {
                      backgroundColor: theme.surface,
                      color: lowStock ? theme.error : theme.text,
                      borderColor: lowStock ? theme.error : theme.border,
                    },
                  ]}
                  value={draft.stock}
                  onChangeText={(text) =>
                    setEditing((prev) => ({
                      ...prev,
                      [product.id]: { ...prev[product.id], stock: text },
                    }))
                  }
                  keyboardType="numeric"
                />
                <Pressable
                  style={[styles.stockButton, { backgroundColor: theme.success }]}
                  onPress={() => handleStockIncrement(product.id, 1)}
                  disabled={isSaving}
                >
                  <FontAwesome name="plus" size={14} color="#fff" />
                </Pressable>
              </View>
            </View>

            {/* Active Toggle & Save */}
            <View style={styles.actionsColumn}>
              <View style={styles.switchRow}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>
                  {t('store_owner_active')}
                </Text>
                <Switch
                  value={product.isActive}
                  onValueChange={(value) => handleToggleActive(product.id, value)}
                  disabled={isSaving}
                  trackColor={{ false: '#767577', true: theme.success }}
                  thumbColor="#fff"
                />
              </View>

              {hasChanges && (
                <Pressable
                  style={[styles.saveButton, { backgroundColor: theme.primary }]}
                  onPress={() => handleSaveProduct(product.id)}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <FontAwesome name="check" size={16} color="#fff" />
                  )}
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  productRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  productInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  productImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  productImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
  },
  productCategory: {
    fontSize: 12,
    marginTop: 2,
  },
  priceColumn: {
    width: 100,
  },
  stockColumn: {
    width: 120,
  },
  actionsColumn: {
    width: 80,
    alignItems: 'flex-end',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 13,
  },
  stockControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stockInput: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
