import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  query: string;
  onChangeQuery: (value: string) => void;
  cartCount: number;
  onOpenCart: () => void;
  title?: string;
  subtitle?: string;
};

export function StoreSearchHeader({
  query,
  onChangeQuery,
  cartCount,
  onOpenCart,
  title,
  subtitle,
}: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[
          'rgba(32, 85, 196, 0.32)',
          'rgba(32, 85, 196, 0.1)',
          'rgba(74, 127, 224, 0.14)',
          'rgba(11, 17, 32, 0)',
        ]}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerWash}
      />
      <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtl]}>
        {title ?? t('store_title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }, isRTL && styles.rtl]}>
        {subtitle ?? t('store_subtitle')}
      </Text>
      <View style={[styles.searchRow, isRTL && styles.searchRowRtl]}>
        <View style={[styles.searchField, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <FontAwesome name="search" size={16} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder={t('store_search_placeholder')}
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }, isRTL && styles.rtl]}
          />
        </View>
        <Pressable
          onPress={onOpenCart}
          style={[styles.cartBtn, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <FontAwesome name="shopping-cart" size={18} color={theme.text} />
          {cartCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <Text style={[styles.badgeText, { color: theme.onAccent }]}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  headerWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  searchRowRtl: { flexDirection: 'row-reverse' },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  cartBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '900' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
