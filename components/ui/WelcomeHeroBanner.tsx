import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_BRAND_NAME, BRAND_COBALT } from '@/constants/Brand';
import { HERO_IMAGE } from '@/components/ui/VisualCategoryCard';

const KOHLY = BRAND_COBALT;
const WHITE = '#FFFFFF';
const BLACK = '#000000';

type Props = {
  title: string;
  subtitle: string;
  vehicleLabel: string;
  manageLabel: string;
  bookingsLabel: string;
  rtl?: boolean;
  bell?: React.ReactNode;
  onVehiclePress: () => void;
  onManagePress: () => void;
  onBookingsPress: () => void;
};

export function WelcomeHeroBanner({
  title,
  subtitle,
  vehicleLabel,
  manageLabel,
  bookingsLabel,
  rtl = false,
  bell,
  onVehiclePress,
  onManagePress,
  onBookingsPress,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Image
        source={HERO_IMAGE}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="right"
        transition={0}
      />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0.38)', 'rgba(0, 0, 0, 0.62)']}
        locations={[0, 0.52, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.idleBorder} />

      <View style={styles.inner}>
        <View style={[styles.topRow, rtl && styles.rowRtl]}>
          <Text style={styles.brand}>{APP_BRAND_NAME}</Text>
          {bell ? <View style={styles.bellSlot}>{bell}</View> : <View style={styles.bellSpacer} />}
        </View>

        <View style={[styles.nameRow, rtl && styles.rowRtl]}>
          <Text style={[styles.title, rtl && styles.textRtl]} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onVehiclePress}
            style={({ pressed }) => [styles.vehiclePill, rtl && styles.rowRtl, pressed && styles.pressed]}>
            <View style={styles.vehicleDot} />
            <Text style={styles.vehicleText} numberOfLines={1}>
              {vehicleLabel}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.subtitle, rtl && styles.textRtl]} numberOfLines={1}>
          {subtitle}
        </Text>

        <View style={[styles.actions, rtl && styles.rowRtl]}>
          <Pressable
            onPress={onManagePress}
            style={({ pressed }) => [styles.pill, styles.pillPrimary, pressed && styles.pressed]}>
            <Text style={styles.pillPrimaryText}>{manageLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onBookingsPress}
            style={({ pressed }) => [styles.pill, styles.pillGhost, pressed && styles.pressed]}>
            <Text style={styles.pillGhostText}>{bookingsLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxHeight: 176,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: BLACK,
    marginBottom: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 10px 24px rgba(4, 12, 29, 0.18)' } : null),
  },
  idleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: KOHLY,
    pointerEvents: 'none',
  },
  inner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    zIndex: 2,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowRtl: {
    flexDirection: 'row-reverse',
  },
  brand: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  bellSlot: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: WHITE,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  bellSpacer: {
    width: 32,
    height: 32,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    flexShrink: 1,
  },
  subtitle: {
    color: WHITE,
    fontSize: 12,
    lineHeight: 16,
  },
  textRtl: {
    textAlign: 'right',
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 180,
    backgroundColor: WHITE,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  vehicleDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: KOHLY,
  },
  vehicleText: {
    flexShrink: 1,
    color: KOHLY,
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPrimary: {
    backgroundColor: WHITE,
  },
  pillGhost: {
    backgroundColor: WHITE,
    borderWidth: 0,
  },
  pillPrimaryText: {
    color: KOHLY,
    fontSize: 12,
    fontWeight: '800',
  },
  pillGhostText: {
    color: KOHLY,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
});
