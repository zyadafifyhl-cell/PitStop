import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop, Circle } from 'react-native-svg';

import type { AppThemeTokens } from '@/constants/Theme';

type Props = {
  theme: AppThemeTokens;
  variant?: 'home' | 'welcome';
};

export function AutomotiveBackground({ theme, variant = 'home' }: Props) {
  const lineColor = theme.border;
  const cobalt = theme.gradientLabani;
  const cobaltLift = theme.gradientYellow;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={theme.bg} stopOpacity={1} />
            <Stop offset="55%" stopColor={theme.bg} stopOpacity={1} />
            <Stop offset="100%" stopColor={theme.bg} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="heroWash" x1="0%" y1="0%" x2="100%" y2="55%">
            <Stop offset="0%" stopColor={cobalt} stopOpacity={0.34} />
            <Stop offset="48%" stopColor={cobalt} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={cobaltLift} stopOpacity={0.18} />
          </LinearGradient>
          <LinearGradient id="heroFade" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={theme.bg} stopOpacity={0} />
            <Stop offset="70%" stopColor={theme.bg} stopOpacity={0.55} />
            <Stop offset="100%" stopColor={theme.bg} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="cobaltHalo" cx="18%" cy="8%" r="58%">
            <Stop offset="0%" stopColor={cobalt} stopOpacity={0.42} />
            <Stop offset="45%" stopColor={cobalt} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={cobalt} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="liftHalo" cx="88%" cy="12%" r="52%">
            <Stop offset="0%" stopColor={cobaltLift} stopOpacity={0.28} />
            <Stop offset="50%" stopColor={cobaltLift} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={cobaltLift} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bottomHalo" cx="50%" cy="92%" r="48%">
            <Stop offset="0%" stopColor={cobalt} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={cobalt} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="400" height="800" fill="url(#bgGrad)" />
        <Rect x="0" y="0" width="400" height="320" fill="url(#heroWash)" />
        <Rect x="0" y="0" width="400" height="340" fill="url(#heroFade)" />
        <Circle cx="40" cy="40" r="200" fill="url(#cobaltHalo)" />
        <Circle cx="360" cy="60" r="190" fill="url(#liftHalo)" />
        <Circle cx="200" cy="760" r="180" fill="url(#bottomHalo)" />
        {variant === 'welcome' ? (
          <>
            <Ellipse cx="48" cy="86" rx="78" ry="56" fill={cobalt} opacity={0.08} />
            <Ellipse cx="360" cy="740" rx="96" ry="66" fill={cobaltLift} opacity={0.06} />
          </>
        ) : null}
        <Path
          d="M-20 120 Q 120 80 260 140 T 420 100"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.45}
        />
        <Path
          d="M-40 280 Q 140 220 320 300 T 440 260"
          stroke={cobalt}
          strokeWidth={1.2}
          fill="none"
          opacity={0.22}
        />
        <Path
          d="M0 440 Q 180 380 360 460 T 420 420"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.35}
        />
        {variant === 'welcome' ? (
          <Path
            d="M-60 620 Q 200 560 400 640"
            stroke={cobaltLift}
            strokeWidth={1.5}
            fill="none"
            opacity={0.2}
          />
        ) : null}
      </Svg>
    </View>
  );
}
