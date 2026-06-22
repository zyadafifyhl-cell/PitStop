import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

function arcColor(pct: number): string {
  if (pct <= 50) return '#2e7d32';
  if (pct <= 89) return '#f9a825';
  if (pct < 100) return '#c62828';
  return '#b71c1c';
}

type Props = {
  /** 0–100 (% of interval used since last service), or null when unknown */
  pct: number | null;
  size?: number;
};

export function MaintenanceRing({ pct, size = 76 }: Props) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safePct = pct == null ? null : Math.min(100, Math.max(0, pct));
  const dashOffset = safePct == null ? c : c * (1 - safePct / 100);
  const strokeColor = safePct == null ? '#90a4ae' : arcColor(safePct);

  const label = useMemo(() => {
    if (safePct == null) return '—';
    return `${Math.round(safePct)}%`;
  }, [safePct]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#00000022"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={strokeColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.pct}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: {
    fontSize: 15,
    fontWeight: '800',
    color: '#263238',
  },
});
