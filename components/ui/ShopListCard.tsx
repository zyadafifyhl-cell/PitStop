import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme, SERVICE_COLORS } from '@/constants/Theme';
import { formatPhoneDisplay } from '@/lib/linking/contact';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  name: string;
  address: string;
  type: ShopType;
  typeLabel: string;
  rating?: number;
  phone?: string;
  distanceLabel?: string;
  bookLabel: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onCall?: () => void;
  onOpenMaps?: () => void;
  onPress: () => void;
};

export function ShopListCard({
  name,
  address,
  type,
  typeLabel,
  rating,
  phone,
  distanceLabel,
  bookLabel,
  isFavorite,
  onToggleFavorite,
  onCall,
  onOpenMaps,
  onPress,
}: Props) {
  const accent = SERVICE_COLORS[type];

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#1E293B', AppTheme.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: `${accent}33` }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{typeLabel}</Text>
          </View>
          <View style={styles.topRight}>
            {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
            {rating != null ? (
              <View style={styles.rating}>
                <FontAwesome name="star" size={12} color={AppTheme.warm} />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {onToggleFavorite ? (
              <Pressable onPress={onToggleFavorite} hitSlop={8} style={styles.iconBtn}>
                <FontAwesome
                  name={isFavorite ? 'heart' : 'heart-o'}
                  size={20}
                  color={isFavorite ? '#EF4444' : AppTheme.textDim}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.address}>{address}</Text>

        {phone && onCall ? (
          <Pressable onPress={onCall} style={styles.phoneRow}>
            <FontAwesome name="phone" size={14} color={AppTheme.green} />
            <Text style={styles.phoneText}>{formatPhoneDisplay(phone)}</Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable onPress={onPress} style={styles.bookBtn}>
            <Text style={[styles.book, { color: accent }]}>{bookLabel}</Text>
          </Pressable>
          <View style={styles.footerIcons}>
            {onOpenMaps ? (
              <Pressable onPress={onOpenMaps} hitSlop={8} style={styles.iconBtn}>
                <FontAwesome name="map-marker" size={18} color={accent} />
              </Pressable>
            ) : null}
            <Pressable onPress={onPress} hitSlop={8}>
              <FontAwesome name="arrow-circle-right" size={18} color={accent} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppTheme.border,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  distance: { color: AppTheme.accent, fontSize: 12, fontWeight: '700' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: AppTheme.text, fontSize: 13, fontWeight: '600' },
  iconBtn: { padding: 4 },
  name: { color: AppTheme.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  address: { color: AppTheme.textMuted, fontSize: 14, lineHeight: 20 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: AppTheme.greenSoft,
    alignSelf: 'flex-start',
  },
  phoneText: { color: AppTheme.text, fontSize: 15, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  bookBtn: { flex: 1 },
  footerIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  book: { fontSize: 15, fontWeight: '700' },
});
