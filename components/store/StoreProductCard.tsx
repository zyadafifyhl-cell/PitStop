import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { StoreProductImageSlider } from '@/components/store/StoreProductImageSlider';
import { StoreQuantityStepper } from '@/components/store/StoreQuantityStepper';
import { StoreStarRating } from '@/components/store/StoreStarRating';
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

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : styles.cardRegular,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
      <View style={styles.imageWrap}>
        <StoreProductImageSlider
          product={product}
          compact={compact}
          placeholderIcon={productIconName(product.subCategory)}
        />
        {outOfStock ? (
          <View style={[styles.stockBadge, { backgroundColor: theme.danger }]}>
            <Text style={styles.stockBadgeText}>{t('store_out_of_stock')}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text
          style={[compact ? styles.nameCompact : styles.name, { color: theme.text }]}
          numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={[compact ? styles.sellerCompact : styles.subCategory, { color: theme.textMuted }]}>
          {subCategoryLabel(product.subCategory, locale, product.category)}
        </Text>
        <StoreStarRating rating={product.rating} count={product.ratingCount} compact={compact} />
        <Text style={[compact ? styles.priceCompact : styles.price, { color: theme.text }]}>
          {formatEgp(product.price, locale)}
        </Text>
      </View>

      {inCart && onChangeQuantity ? (
        <View style={styles.stepperWrap}>
          <StoreQuantityStepper
            quantity={cartQuantity}
            max={stock}
            compact={compact}
            disabled={adding}
            onChange={onChangeQuantity}
          />
        </View>
      ) : (
        <Pressable
          onPress={onAddToCart}
          disabled={outOfStock || atMax || adding}
          style={[
            compact ? styles.addBtnCompact : styles.addBtn,
            {
              backgroundColor: outOfStock ? theme.border : theme.accent,
              opacity: adding || outOfStock ? 0.7 : 1,
            },
          ]}>
          {adding ? (
            <ActivityIndicator color={theme.onAccent} size="small" />
          ) : (
            <>
              <FontAwesome name="shopping-cart" size={compact ? 12 : 14} color={theme.onAccent} />
              <Text style={[compact ? styles.addBtnTextCompact : styles.addBtnText, { color: theme.onAccent }]}>
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
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    minWidth: 0,
    overflow: 'hidden',
  },
  cardCompact: { padding: 8 },
  cardRegular: { padding: 10 },
  imageWrap: { marginBottom: 8, position: 'relative' },
  stockBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stockBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  body: { flexGrow: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  nameCompact: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  sellerCompact: { fontSize: 10, fontWeight: '600' },
  subCategory: { fontSize: 12 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  priceCompact: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  stepperWrap: { marginTop: 8 },
  addBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnCompact: {
    marginTop: 6,
    borderRadius: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addBtnText: { fontSize: 12, fontWeight: '800' },
  addBtnTextCompact: { fontSize: 10, fontWeight: '800' },
});
