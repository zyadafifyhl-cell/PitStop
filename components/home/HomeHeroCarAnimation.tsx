import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const HERO_CARD_BG = '#121826';
const CAR_TINT = '#00D4FF';
const TRACK_BG = 'rgba(0, 212, 255, 0.08)';
const IDLE_MS = 400;
const DRIVE_MS = 1400;
const CAR_WIDTH = 76;
const CAR_HEIGHT = 42;

function CarVector({ color }: { color: string }) {
  return (
    <Svg width={CAR_WIDTH} height={CAR_HEIGHT} viewBox="0 0 76 42" fill="none">
      <Path
        d="M10 24h8l4-7h20l5 7h19c2.2 0 4 1.8 4 4v2H6v-2c0-2.2 1.8-4 4-4Z"
        fill={color}
        opacity={0.92}
      />
      <Path d="M22 17h18l4 7H26l-4-7Z" fill={color} opacity={0.55} />
      <Rect x="24" y="19" width="8" height="5" rx="1.5" fill="#080D1A" opacity={0.35} />
      <Rect x="36" y="19" width="8" height="5" rx="1.5" fill="#080D1A" opacity={0.35} />
      <Circle cx="20" cy="30" r="5.5" fill="#080D1A" stroke={color} strokeWidth="2" />
      <Circle cx="56" cy="30" r="5.5" fill="#080D1A" stroke={color} strokeWidth="2" />
      <Circle cx="20" cy="30" r="2" fill={color} opacity={0.7} />
      <Circle cx="56" cy="30" r="2" fill={color} opacity={0.7} />
    </Svg>
  );
}

export function HomeHeroCarAnimation() {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-10)).current;

  useFocusEffect(
    useCallback(() => {
      translateY.setValue(0);
      translateX.setValue(-10);

      const idleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: -6,
            duration: IDLE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: IDLE_MS,
            useNativeDriver: true,
          }),
        ]),
      );

      const driveLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: 10,
            duration: DRIVE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: -10,
            duration: DRIVE_MS,
            useNativeDriver: true,
          }),
        ]),
      );

      idleLoop.start();
      driveLoop.start();

      return () => {
        idleLoop.stop();
        driveLoop.stop();
      };
    }, [translateX, translateY]),
  );

  return (
    <View style={styles.container} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        <View style={styles.trackLine} />
        <Animated.View
          style={[
            styles.carWrap,
            {
              transform: [{ translateX }, { translateY }],
            },
          ]}>
          <CarVector color={CAR_TINT} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    minWidth: 120,
    maxWidth: 168,
    flexGrow: 0,
    flexShrink: 0,
    height: 64,
    borderRadius: 16,
    backgroundColor: HERO_CARD_BG,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  track: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  trackLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: TRACK_BG,
  },
  carWrap: {
    marginBottom: 6,
  },
});
