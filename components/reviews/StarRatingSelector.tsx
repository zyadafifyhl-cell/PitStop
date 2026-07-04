import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  disabled?: boolean;
  filledColor?: string;
  emptyColor?: string;
  gap?: number;
};

export function StarRatingSelector({
  value,
  onChange,
  size = 36,
  disabled,
  filledColor,
  emptyColor,
  gap = 8,
}: Props) {
  const theme = useAppTheme();
  const activeColor = filledColor ?? theme.warm;
  const inactiveColor = emptyColor ?? theme.textDim;
  const scales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  useEffect(() => {
    scales.forEach((scale, index) => {
      const star = index + 1;
      Animated.spring(scale, {
        toValue: star <= value ? 1.12 : 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [value, scales]);

  function onPressStar(star: number) {
    if (disabled) return;
    Animated.sequence([
      Animated.spring(scales[star - 1], {
        toValue: 1.28,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.spring(scales[star - 1], {
        toValue: star <= value ? 1.12 : 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();
    onChange(star);
  }

  return (
    <View style={[styles.row, { gap }]} accessibilityRole="adjustable">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => onPressStar(star)}
            disabled={disabled}
            accessibilityLabel={`${star} stars`}
            hitSlop={8}
            style={styles.starBtn}>
            <Animated.View style={{ transform: [{ scale: scales[star - 1] }] }}>
              <FontAwesome
                name={filled ? 'star' : 'star-o'}
                size={size}
                color={filled ? activeColor : inactiveColor}
              />
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  starBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
