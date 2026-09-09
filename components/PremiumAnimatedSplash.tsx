import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

const HOLD_MS = 1000;
const FADE_MS = 500;

type Props = {
  onFinish: () => void;
};

export function PremiumAnimatedSplash({ onFinish }: Props) {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const holdTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, HOLD_MS);

    return () => clearTimeout(holdTimer);
  }, [opacity, onFinish]);

  return (
    <Animated.View style={[styles.overlay, { opacity, backgroundColor: theme.bg }]} pointerEvents="auto">
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>PitStop</Text>
        <Text style={[styles.subtitle, { color: theme.brand }]}>Premium car care · EG</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
