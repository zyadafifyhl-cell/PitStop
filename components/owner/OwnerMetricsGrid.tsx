import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

export type OwnerMetric = {
  id: string;
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
};

export function OwnerMetricsGrid({ metrics }: { metrics: readonly OwnerMetric[] }) {
  const theme = useAppTheme();
  const tones = {
    accent: theme.brand,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
  };
  const toneBackgrounds = {
    accent: theme.brandSoft,
    success: theme.successSoft,
    warning: theme.warningSoft,
    danger: theme.dangerSoft,
  };

  return (
    <View style={styles.grid}>
      {metrics.map((metric) => {
        const tone = metric.tone ?? 'accent';
        const color = tones[tone];
        const body = (
          <>
            <View style={[styles.icon, { backgroundColor: toneBackgrounds[tone] }]}>
              <FontAwesome name={metric.icon} size={17} color={color} />
            </View>
            <Text style={[styles.value, { color: theme.text }]}>{metric.value}</Text>
            <Text style={[styles.label, { color: theme.textMuted }]}>{metric.label}</Text>
          </>
        );
        const cardStyle = [styles.card, { backgroundColor: theme.card, borderColor: theme.border }];

        if (metric.onPress) {
          return (
            <Pressable
              key={metric.id}
              onPress={metric.onPress}
              accessibilityRole="button"
              accessibilityLabel={metric.label}
              style={({ pressed }) => [...cardStyle, pressed ? { opacity: 0.82 } : null]}>
              {body}
            </Pressable>
          );
        }

        return (
          <View key={metric.id} style={cardStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 145,
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  value: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  label: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
});
