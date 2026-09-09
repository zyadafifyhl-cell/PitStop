import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { StoreProductImageSlider } from '@/components/store/StoreProductImageSlider';
import { StoreQuantityStepper } from '@/components/store/StoreQuantityStepper';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { subCategoryLabel } from '@/lib/store/constants';
import { availableStock, isAtMaxStock, isOutOfStock } from '@/lib/store/stockLimits';
import type { StoreProduct } from '@/lib/store/types';

type Props = {
  product: StoreProduct;
  adding?: boolean;
  compact?: boolean;
  /** Stretch to fill a FlatList column. Leave off in stacked/profile layouts. */
  fillRow?: boolean;
  imageHeight?: number;
  imageFit?: 'contain' | 'cover';
  cartQuantity?: number;
  onAddToCart: () => void;
  onChangeQuantity?: (next: number) => void;
};

function productIconName(subCategory: string): React.ComponentProps<typeof FontAwesome>['name'] {
  if (subCategory.includes('oil')) return 'tint';
  if (subCategory.includes('filter')) return 'filter';
  if (subCategory.includes('brake')) return 'circle';
  if (subCategory.includes('elect')) return 'plug';
  if (subCategory.includes('battery')) return 'battery-full';
  return 'cog';
}

export function StoreProductCard({
  product,
  adding,
  compact = false,
  fillRow = false,
  imageHeight = 180,
  imageFit = 'contain',
  cartQuantity = 0,
  onAddToCart,
  onChangeQuantity,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const stock = availableStock(product);
  const outOfStock = isOutOfStock(product);
  const atMax = isAtMaxStock(cartQuantity, stock);
  const inCart = cartQuantity > 0;
  const category = subCategoryLabel(product.subCategory, locale, product.category);

  return (
    <View
      style={[
        styles.card,
        fillRow ? styles.cardFill : null,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
      ]}>
      <View style={styles.imageWrap}>
        <StoreProductImageSlider
          product={product}
          compact={compact}
          frameHeight={imageHeight}
          contentFit={imageFit}
          placeholderIcon={productIconName(product.subCategory)}
        />
        {outOfStock ? (
          <View style={[styles.stockBadge, { backgroundColor: theme.dangerSoft }]}>
            <Text style={[styles.stockBadgeText, { color: theme.danger }]}>{t('store_out_of_stock')}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={[styles.category, { color: theme.textMuted }]} numberOfLines={1}>
          {category}
        </Text>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={[styles.price, { color: theme.text }]}>{formatEgp(product.price, locale)}</Text>
      </View>

      {inCart && onChangeQuantity ? (
        <View style={styles.stepperWrap}>
          <StoreQuantityStepper
            quantity={cartQuantity}
            max={stock}
            compact
            disabled={adding}
            onChange={onChangeQuantity}
          />
        </View>
      ) : (
        <Pressable
          onPress={onAddToCart}
          disabled={outOfStock || atMax || adding}
          style={[
            styles.addBtn,
            {
              backgroundColor: outOfStock ? theme.cardHover : theme.accent,
              opacity: adding || outOfStock ? 0.7 : 1,
            },
          ]}>
          {adding ? (
            <ActivityIndicator color={theme.onAccent} size="small" />
          ) : (
            <>
              <FontAwesome name="shopping-cart" size={13} color={theme.onAccent} />
              <Text style={[styles.addBtnText, { color: theme.onAccent }]}>
                {outOfStock ? t('store_out_of_stock') : t('store_add_to_cart')}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
  },
  cardFill: { alignSelf: 'stretch' },
  imageWrap: { width: '100%', marginBottom: 0, position: 'relative' },
  stockBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockBadgeText: { fontSize: 10, fontWeight: '700' },
  body: { flexGrow: 1 },
  category: { fontSize: 12, fontWeight: '500', marginTop: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  price: { fontSize: 16, fontWeight: '700', marginVertical: 6 },
  stepperWrap: { marginTop: 2 },
  addBtn: {
    height: 48,
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: '600' },
});
