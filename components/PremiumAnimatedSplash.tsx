import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

import { BRAND_COBALT } from '@/constants/Brand';

const HOLD_MS = 1000;
const FADE_MS = 500;

type Props = {
  onFinish: () => void;
};

export function PremiumAnimatedSplash({ onFinish }: Props) {
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
    <Animated.View style={[styles.overlay, { opacity, backgroundColor: BRAND_COBALT }]} pointerEvents="auto">
      <View style={styles.content}>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="PitStop"
        />
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
  logo: {
    width: 280,
    height: Math.round(280 / (848 / 437)),
    tintColor: '#FFFFFF',
  },
});
