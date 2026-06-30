import React, { useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image, type ImageContentFit } from 'expo-image';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  fallbackIcon?: React.ComponentProps<typeof FontAwesome>['name'];
  fallbackIconSize?: number;
};

export function ShopMediaImage({
  uri,
  style,
  contentFit = 'cover',
  fallbackIcon = 'image',
  fallbackIconSize = 24,
}: Props) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const clean = uri?.trim();

  if (!clean || failed) {
    return (
      <View style={[style, styles.fallback, { backgroundColor: theme.bgElevated }]}>
        <FontAwesome name={fallbackIcon} size={fallbackIconSize} color={theme.textDim} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: clean }}
      style={style}
      contentFit={contentFit}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
