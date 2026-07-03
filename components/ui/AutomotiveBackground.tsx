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
  const accentLine = theme.accentSoft;
  const topGlow = theme.accent;
  const bottomGlow = theme.warm;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0C1830" stopOpacity={1} />
            <Stop offset="35%" stopColor="#081428" stopOpacity={1} />
            <Stop offset="100%" stopColor={theme.bg} stopOpacity={1} />
          </LinearGradient>
          <LinearGradient id="blueSweep" x1="0%" y1="10%" x2="90%" y2="90%">
            <Stop offset="0%" stopColor={topGlow} stopOpacity={0.30} />
            <Stop offset="45%" stopColor={topGlow} stopOpacity={0.10} />
            <Stop offset="100%" stopColor={topGlow} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id="topHalo" cx="76%" cy="18%" r="62%">
            <Stop offset="0%" stopColor={topGlow} stopOpacity={0.42} />
            <Stop offset="42%" stopColor={topGlow} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={topGlow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="bottomHalo" cx="18%" cy="84%" r="56%">
            <Stop offset="0%" stopColor={bottomGlow} stopOpacity={0.30} />
            <Stop offset="52%" stopColor={bottomGlow} stopOpacity={0.11} />
            <Stop offset="100%" stopColor={bottomGlow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="400" height="800" fill="url(#bgGrad)" />
        {variant === 'welcome' ? (
          <>
            <Rect x="-20" y="0" width="440" height="800" fill="url(#blueSweep)" />
            <Ellipse cx="48" cy="86" rx="78" ry="56" fill="rgba(255,255,255,0.08)" />
            <Ellipse cx="360" cy="740" rx="96" ry="66" fill="rgba(255,255,255,0.06)" />
            <Circle cx="310" cy="120" r="220" fill="url(#topHalo)" />
            <Circle cx="80" cy="660" r="210" fill="url(#bottomHalo)" />
          </>
        ) : (
          <Circle cx="80" cy="660" r="210" fill="url(#bottomHalo)" />
        )}
        <Path
          d="M-20 120 Q 120 80 260 140 T 420 100"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.62}
        />
        <Path
          d="M-40 280 Q 140 220 320 300 T 440 260"
          stroke={accentLine}
          strokeWidth={1.5}
          fill="none"
          opacity={1}
        />
        <Path
          d="M0 440 Q 180 380 360 460 T 420 420"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.56}
        />
        {variant === 'welcome' ? (
          <Path
            d="M-60 620 Q 200 560 400 640"
            stroke={accentLine}
            strokeWidth={2}
            fill="none"
            opacity={0.7}
          />
        ) : null}
      </Svg>
    </View>
  );
}
