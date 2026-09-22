import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { AppThemeTokens } from '@/constants/Theme';

type Props = {
  theme: AppThemeTokens;
  variant?: 'home' | 'welcome';
};

export function AutomotiveBackground({ theme, variant = 'home' }: Props) {
  const lineColor = theme.border;
  const cobalt = theme.gradientLabani;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width="400" height="800" fill={theme.bg} />
        <Path
          d="M-40 112 L440 28"
          stroke={cobalt}
          strokeWidth={variant === 'welcome' ? 2 : 1.5}
          fill="none"
          opacity={0.08}
        />
        <Path
          d="M-40 126 L440 42"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.7}
        />
        <Path
          d="M-60 486 L460 394"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.45}
        />
        <Path
          d="M-60 500 L460 408"
          stroke={lineColor}
          strokeWidth={1}
          fill="none"
          opacity={0.25}
        />
      </Svg>
    </View>
  );
}
