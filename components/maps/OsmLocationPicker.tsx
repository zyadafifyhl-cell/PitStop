import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
};

export function OsmLocationPicker({ latitude, longitude }: Props) {
  const theme = useAppTheme();

  return (
    <View
      style={{
        minHeight: 140,
        borderRadius: theme.radiusSm,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card,
        justifyContent: 'center',
        paddingHorizontal: 12,
      }}>
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        Map picker is available on web with OpenStreetMap.
      </Text>
      <Text style={{ color: theme.text, marginTop: 6 }}>
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </Text>
    </View>
  );
}
