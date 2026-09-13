import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { APP_BRAND_NAME, BRAND_COBALT } from '@/constants/Brand';
import { useThemePreference } from '@/context/ThemePreferenceContext';

type Size = 'hero' | 'compact' | 'watermark';

type Props = {
  size?: Size;
  style?: ViewStyle;
  imageStyle?: StyleProp<ImageStyle>;
};

/** Native asset aspect ≈ 848×437 */
const LOGO_ASPECT = 848 / 437;

const WIDTH: Record<Size, number> = {
  hero: 248,
  compact: 176,
  watermark: 300,
};

const OPACITY: Record<Size, number> = {
  hero: 1,
  compact: 1,
  watermark: 0.14,
};

export function PitStopEgWordmark({ size = 'hero', style, imageStyle }: Props) {
  const { effectivePreference } = useThemePreference();
  const width = WIDTH[size];
  const height = Math.round(width / LOGO_ASPECT);
  const tintColor = effectivePreference === 'light' ? BRAND_COBALT : '#FFFFFF';

  return (
    <View
      style={[styles.wrap, style, { opacity: OPACITY[size] }]}
      accessibilityRole="header"
      accessibilityLabel={APP_BRAND_NAME}>
      <Image
        source={require('../../assets/images/logo.png')}
        style={[{ width, height, tintColor }, imageStyle]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
