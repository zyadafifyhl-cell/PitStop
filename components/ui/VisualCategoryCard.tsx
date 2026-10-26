import { Image, type ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BRAND_COBALT } from '@/constants/Brand';
import type { ShopType } from '@/lib/booking/types';

type CategoryImage = NonNullable<ImageProps['source']>;

export const DEFAULT_CATEGORY_IMAGE = require('../../assets/images/categories/car-wash.png') as CategoryImage;
export const HERO_IMAGE = require('../../assets/images/categories/wash-bay.png') as CategoryImage;

const CATEGORY_IMAGES: Partial<Record<ShopType, CategoryImage>> = {
  wash: require('../../assets/images/categories/car-wash-bay-action.jpg') as CategoryImage,
  detailing_studio: require('../../assets/images/categories/detailing-ppf.jpg') as CategoryImage,
  maintenance: require('../../assets/images/categories/maintenance.jpg') as CategoryImage,
  parts: require('../../assets/images/categories/spare-parts.jpg') as CategoryImage,
  accessories: require('../../assets/images/categories/accessories.jpg') as CategoryImage,
  winch: require('../../assets/images/categories/maintenance.jpg') as CategoryImage,
};

const NAVY = '#040C1D';
const KOHLY = BRAND_COBALT;
const WHITE = '#FFFFFF';
const ANIM_MS = 180;
const EASE = Easing.inOut(Easing.ease);

type Props = {
  imageSource?: CategoryImage;
  title: string;
  subText: string;
  badge?: string;
  featured?: boolean;
  rtl?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function categoryImageFor(type: ShopType): CategoryImage {
  return CATEGORY_IMAGES[type] ?? DEFAULT_CATEGORY_IMAGE;
}

export function VisualCategoryCard({
  imageSource = DEFAULT_CATEGORY_IMAGE,
  title,
  subText,
  badge,
  featured = false,
  rtl = false,
  onPress,
  style,
}: Props) {
  const { width } = useWindowDimensions();
  const singleCol = width < 380;
  const progress = useSharedValue(0);

  const activate = useCallback(() => {
    progress.value = withTiming(1, { duration: ANIM_MS, easing: EASE });
  }, [progress]);

  const deactivate = useCallback(() => {
    progress.value = withTiming(0, { duration: ANIM_MS, easing: EASE });
  }, [progress]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.04 }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.47,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      onPressIn={activate}
      onPressOut={deactivate}
      onHoverIn={activate}
      onHoverOut={deactivate}
      style={[
        styles.pressable,
        featured || singleCol ? styles.featured : styles.standard,
        featured && !singleCol ? styles.featuredWide : null,
        style,
      ]}>
      <View style={styles.clip}>
        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
          <Image
            source={imageSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            transition={0}
          />
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, styles.ignoreTouches, overlayStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0.62)']}
            locations={[0, 0.55, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={[styles.idleBorder, styles.ignoreTouches]} />
        <Animated.View style={[styles.glowBorder, styles.ignoreTouches, glowStyle]} />

        <View style={[styles.copy, rtl && styles.copyRtl]}>
          {badge ? (
            <View style={[styles.badge, rtl && styles.badgeRtl]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subText} numberOfLines={2}>
            {subText}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: 16,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  featured: {
    width: '100%',
    height: 168,
  },
  featuredWide: {
    height: 200,
  },
  standard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: '47%',
    height: 168,
  },
  clip: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: NAVY,
  },
  ignoreTouches: {
    pointerEvents: 'none',
  },
  idleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: KOHLY,
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: WHITE,
    ...Platform.select({
      web: { boxShadow: '0 0 16px rgba(0, 37, 92, 0.55)' },
      default: {
        shadowColor: KOHLY,
        shadowOpacity: 0.45,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      },
    }),
  },
  copy: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    alignItems: 'flex-start',
    gap: 4,
  },
  copyRtl: {
    alignItems: 'flex-end',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: WHITE,
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 2,
  },
  badgeRtl: {
    alignSelf: 'flex-end',
  },
  badgeText: {
    color: KOHLY,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 22,
    ...Platform.select({
      web: { textShadow: '0 1px 6px rgba(4, 12, 29, 0.65)' },
      default: {
        textShadowColor: 'rgba(4, 12, 29, 0.65)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
      },
    }),
  },
  subText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
});
