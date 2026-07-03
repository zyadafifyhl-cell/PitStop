import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { APP_BRAND_NAME } from '@/constants/Brand';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Size = 'hero' | 'compact' | 'watermark';

type Props = {
  size?: Size;
  style?: ViewStyle;
};

const FONT_SIZE: Record<Size, number> = {
  hero: 22,
  compact: 18,
  watermark: 42,
};

export function PitStopEgWordmark({ size = 'hero', style }: Props) {
  const theme = useAppTheme();
  const fontSize = FONT_SIZE[size];
  const muted = size === 'watermark';

  return (
    <View
      style={[styles.wrap, style, muted ? { opacity: 0.1 } : null]}
      accessibilityRole="header"
      accessibilityLabel={APP_BRAND_NAME}>
      <Text
        style={[
          styles.wordmark,
          {
            color: theme.text,
            fontSize,
            lineHeight: fontSize + 6,
          },
        ]}>
        PitStop EG
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
