import React, { useEffect, useState } from 'react';
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
  showSkeleton?: boolean;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  recyclingKey?: string;
};

export function ShopMediaImage({
  uri,
  style,
  contentFit = 'cover',
  fallbackIcon = 'image',
  fallbackIconSize = 24,
  showSkeleton = false,
  cachePolicy = 'memory-disk',
  recyclingKey,
}: Props) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const clean = uri?.trim();

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [clean]);

  if (!clean || failed) {
    return (
      <View style={[style, styles.fallback, { backgroundColor: theme.bgElevated }]}>
        <FontAwesome name={fallbackIcon} size={fallbackIconSize} color={theme.textDim} />
      </View>
    );
  }

  return (
    <View style={style}>
      {showSkeleton && !loaded ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.skeleton,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}
        />
      ) : null}
      <Image
        source={{ uri: clean }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        cachePolicy={cachePolicy}
        recyclingKey={recyclingKey ?? clean}
        transition={120}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
