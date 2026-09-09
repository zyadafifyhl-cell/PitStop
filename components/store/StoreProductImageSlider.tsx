import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { normalizeProductImageUrls } from '@/lib/store/productImages';
import type { StoreProduct } from '@/lib/store/types';

type Props = {
  product: Pick<StoreProduct, 'imageUrl' | 'imageUrls' | 'subCategory'>;
  compact?: boolean;
  frameHeight?: number;
  contentFit?: 'contain' | 'cover';
  placeholderIcon?: React.ComponentProps<typeof FontAwesome>['name'];
};

export function StoreProductImageSlider({
  product,
  compact = false,
  frameHeight = 160,
  contentFit = 'contain',
  placeholderIcon = 'cog',
}: Props) {
  const theme = useAppTheme();
  const urls = useMemo(
    () => normalizeProductImageUrls(product.imageUrls, product.imageUrl),
    [product.imageUrl, product.imageUrls],
  );
  const [index, setIndex] = useState(0);
  const current = urls[Math.min(index, Math.max(urls.length - 1, 0))];
  const iconSize = compact ? 26 : 32;
  const frameStyle = [
    styles.frame,
    { height: frameHeight, backgroundColor: theme.bgElevated, borderColor: theme.border },
  ];

  if (!urls.length) {
    return (
      <View style={[frameStyle, styles.placeholder]}>
        <FontAwesome name={placeholderIcon} size={iconSize} color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height: frameHeight }]}>
      <Image source={{ uri: current }} style={frameStyle} contentFit={contentFit} />
      {urls.length > 1 ? (
        <>
          <Pressable
            onPress={() => setIndex((value) => (value - 1 + urls.length) % urls.length)}
            style={[styles.chevron, styles.chevronLeft, { backgroundColor: 'rgba(2,6,23,0.45)' }]}>
            <FontAwesome name="chevron-left" size={11} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => setIndex((value) => (value + 1) % urls.length)}
            style={[styles.chevron, styles.chevronRight, { backgroundColor: 'rgba(2,6,23,0.45)' }]}>
            <FontAwesome name="chevron-right" size={11} color="#fff" />
          </Pressable>
          <View style={styles.dots}>
            {urls.map((url, dotIndex) => (
              <View
                key={url}
                style={[
                  styles.dot,
                  { backgroundColor: dotIndex === index ? '#fff' : 'rgba(255,255,255,0.45)' },
                ]}
              />
            ))}
          </View>
          <View style={[styles.countBadge, { backgroundColor: 'rgba(2,6,23,0.62)' }]}>
            <Text style={styles.countText}>{index + 1}/{urls.length}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', width: '100%', overflow: 'hidden', borderRadius: 10 },
  frame: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 12 },
  chevron: {
    position: 'absolute',
    top: '42%',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLeft: { left: 6 },
  chevronRight: { right: 6 },
  dots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  countBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  countText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
