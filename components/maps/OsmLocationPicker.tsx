import React from 'react';
import { Text, View } from 'react-native';

type Props = {
  initialLatitude: number;
  initialLongitude: number;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
};

export function OsmLocationPicker({ initialLatitude, initialLongitude }: Props) {
  return (
    <View
      style={{
        minHeight: 140,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#374151',
        justifyContent: 'center',
        paddingHorizontal: 12,
      }}>
      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
        Map picker is available on web with OpenStreetMap.
      </Text>
      <Text style={{ color: '#E5E7EB', marginTop: 6 }}>
        {initialLatitude.toFixed(5)}, {initialLongitude.toFixed(5)}
      </Text>
    </View>
  );
}
