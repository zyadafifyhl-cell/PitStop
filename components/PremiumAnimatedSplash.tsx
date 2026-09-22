import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const HOLD_MS = 1650;
const FADE_MS = 650;

type Props = {
  onFinish: () => void;
};

export function PremiumAnimatedSplash({ onFinish }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentLift = useRef(new Animated.Value(18)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(contentLift, {
        toValue: 0,
        damping: 16,
        stiffness: 110,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: HOLD_MS,
        useNativeDriver: true,
      }),
    ]).start();

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
  }, [contentLift, contentOpacity, opacity, onFinish, progress]);

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="auto">
      <LinearGradient
        colors={['#061126', '#0B2B67', '#1E5AE6']}
        locations={[0, 0.58, 1]}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.grid, { width: Math.max(width, 520), height: Math.max(height, 820) }]}>
        <Svg width="100%" height="100%" viewBox="0 0 520 820" preserveAspectRatio="xMidYMid slice">
          <Path d="M-60 184 L580 72" stroke="#60A5FA" strokeWidth="1" opacity="0.18" />
          <Path d="M-60 198 L580 86" stroke="#FFFFFF" strokeWidth="1" opacity="0.08" />
          <Path d="M-80 646 L600 526" stroke="#60A5FA" strokeWidth="1" opacity="0.16" />
          <Path d="M72 0 L-44 820" stroke="#FFFFFF" strokeWidth="1" opacity="0.05" />
          <Path d="M450 0 L334 820" stroke="#FFFFFF" strokeWidth="1" opacity="0.05" />
        </Svg>
      </View>

      <View style={styles.topRail}>
        <View style={styles.railMark} />
        <Text style={styles.railText}>PITSTOP / STARTING</Text>
        <Text style={styles.railCode}>01</Text>
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentLift }],
          },
        ]}>
        <Text style={styles.eyebrow}>AUTOMOTIVE, REFINED</Text>
        <Image
          source={require('../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          tintColor="#FFFFFF"
          accessibilityLabel="PitStop"
        />
        <View style={styles.loadingRow}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { transform: [{ scaleX: progress }] }]} />
          </View>
          <Text style={styles.loadingText}>LOADING</Text>
        </View>
      </Animated.View>

      <View style={styles.cornerShape} />
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
    overflow: 'hidden',
    backgroundColor: '#061126',
  },
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  topRail: {
    position: 'absolute',
    top: 30,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  railMark: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#60A5FA',
  },
  railText: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  railCode: {
    marginLeft: 'auto',
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: '34%',
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  eyebrow: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  logo: {
    width: 250,
    height: Math.round(250 / (848 / 437)),
  },
  loadingRow: {
    width: '100%',
    maxWidth: 280,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    transformOrigin: 'left',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  cornerShape: {
    position: 'absolute',
    right: -90,
    bottom: -150,
    width: 300,
    height: 300,
    borderWidth: 42,
    borderColor: 'rgba(96, 165, 250, 0.10)',
    transform: [{ rotate: '18deg' }],
  },
});
