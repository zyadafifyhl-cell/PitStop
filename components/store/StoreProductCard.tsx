import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { StoreStarRating } from '@/components/store/StoreStarRating';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { subCategoryLabel } from '@/lib/store/constants';
import type { StoreProduct } from '@/lib/store/types';

type Props = {
  product: StoreProduct;
  adding?: boolean;
  compact?: boolean;
  onAddToCart: () => void;
};

const IMAGE_ASPECT_RATIO = 4 / 3;

function productIconName(subCategory: string): React.ComponentProps<typeof FontAwesome>['name'] {
  if (subCategory.includes('oil')) return 'tint';
  if (subCategory.includes('filter')) return 'filter';
  if (subCategory.includes('brake')) return 'circle';
  if (subCategory.includes('elect')) return 'plug';
  if (subCategory.includes('battery')) return 'battery-full';
  return 'cog';
}

export function StoreProductCard({ product, adding, compact = false, onAddToCart }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const outOfStock = product.stockQuantity <= 0;
  const iconSize = compact ? 26 : 32;

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : styles.cardRegular,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.imageFrame} contentFit="cover" />
        ) : (
          <View style={[styles.imageFrame, styles.placeholder, { backgroundColor: theme.bgElevated }]}>
            <FontAwesome name={productIconName(product.subCategory)} size={iconSize} color={theme.accent} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text
          style={[compact ? styles.nameCompact : styles.name, { color: theme.text }]}
          numberOfLines={2}>
          {product.name}
        </Text>
        {product.sellerLabel ? (
          <Text
            style={[compact ? styles.sellerCompact : styles.seller, { color: theme.textDim }]}
            numberOfLines={1}>
            {product.sellerLabel}
          </Text>
        ) : (
          <Text style={[compact ? styles.sellerCompact : styles.subCategory, { color: theme.textMuted }]}>
            {subCategoryLabel(product.subCategory, locale, product.category)}
          </Text>
        )}
        <StoreStarRating rating={product.rating} count={product.ratingCount} compact={compact} />
        <Text style={[compact ? styles.priceCompact : styles.price, { color: theme.text }]}>
          {formatEgp(product.price, locale)}
        </Text>
      </View>

      <Pressable
        onPress={onAddToCart}
        disabled={outOfStock || adding}
        style={[
          compact ? styles.addBtnCompact : styles.addBtn,
          {
            backgroundColor: outOfStock ? theme.border : theme.accent,
            opacity: adding ? 0.7 : 1,
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
  imageWrap: { marginBottom: 8 },
  imageFrame: {
    width: '100%',
    aspectRatio: IMAGE_ASPECT_RATIO,
    borderRadius: 10,
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  body: { flexGrow: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '800', lineHeight: 18 },
  nameCompact: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  seller: { fontSize: 11, fontWeight: '600' },
  sellerCompact: { fontSize: 10, fontWeight: '600' },
  subCategory: { fontSize: 12 },
  price: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  priceCompact: { fontSize: 13, fontWeight: '900', marginTop: 2 },
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
