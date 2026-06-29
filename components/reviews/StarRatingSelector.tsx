import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  disabled?: boolean;
};

export function StarRatingSelector({ value, onChange, size = 36, disabled }: Props) {
  const theme = useAppTheme();
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
    <View style={styles.row} accessibilityRole="adjustable">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        return (
          <Pressable
            key={star}
            onPress={() => onPressStar(star)}
            disabled={disabled}
            accessibilityLabel={`${star} stars`}
            style={styles.starBtn}>
            <Animated.View style={{ transform: [{ scale: scales[star - 1] }] }}>
              <FontAwesome
                name={filled ? 'star' : 'star-o'}
                size={size}
                color={filled ? theme.accent : theme.textDim}
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
    justifyContent: 'center',
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
});
