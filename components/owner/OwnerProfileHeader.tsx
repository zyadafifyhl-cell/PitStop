import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';

type Props = {
  theme: AppThemeTokens;
  shopName: string;
  typeLabel: string;
  welcomeLine: string;
  coverImage?: string;
  profileImage?: string;
  pickingImage: boolean;
  coverEditLabel: string;
  notificationsLabel?: string;
  notificationCount?: number;
  accountRoleLabel?: string;
  accountEmail?: string;
  onEditCover: () => void;
  onEditProfile: () => void;
  onOpenNotifications?: () => void;
};

export function OwnerProfileHeader({
  theme,
  shopName,
  typeLabel,
  welcomeLine,
  coverImage,
  profileImage,
  pickingImage,
  coverEditLabel,
  notificationsLabel,
  notificationCount = 0,
  accountRoleLabel,
  accountEmail,
  onEditCover,
  onEditProfile,
  onOpenNotifications,
}: Props) {
  return (
    <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.coverWrap}>
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
        ) : (
          <View style={[styles.coverImage, { backgroundColor: theme.bgElevated }]} />
        )}
        {onOpenNotifications ? (
          <Pressable
            onPress={onOpenNotifications}
            style={[styles.notifBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            accessibilityLabel={notificationsLabel}>
            <FontAwesome name="bell" size={16} color={theme.text} />
            {notificationCount > 0 ? (
              <View style={[styles.notifBadge, { backgroundColor: theme.danger }]}>
                <Text style={styles.notifBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
        <Pressable
          onPress={onEditCover}
          disabled={pickingImage}
          style={[styles.coverEditBtn, { backgroundColor: theme.accent, opacity: pickingImage ? 0.65 : 1 }]}>
          <FontAwesome name="camera" size={13} color={theme.onAccent} />
          <Text style={[styles.coverEditText, { color: theme.onAccent }]}>{coverEditLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.heroBody}>
        <View style={styles.avatarRow}>
          <Pressable onPress={onEditProfile} disabled={pickingImage} style={styles.avatarPress}>
            <View style={[styles.avatarRing, { borderColor: theme.card, backgroundColor: theme.card }]}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.bgElevated }]}>
                  <FontAwesome name="building" size={28} color={theme.textDim} />
                </View>
              )}
            </View>
            <View style={[styles.avatarBadge, { backgroundColor: theme.accent, borderColor: theme.card }]}>
              <FontAwesome name="pencil" size={10} color={theme.onAccent} />
            </View>
          </Pressable>

          <View style={styles.heroTextWrap}>
            <Text style={[styles.heroTitle, { color: theme.text }]} numberOfLines={2}>
              {shopName}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.typeBadgeText, { color: theme.accent }]}>{typeLabel}</Text>
            </View>
            <Text style={[styles.heroSub, { color: theme.textMuted }]} numberOfLines={2}>
              {welcomeLine}
            </Text>
            {accountRoleLabel && accountEmail ? (
              <Text style={[styles.accountLine, { color: theme.accent }]} numberOfLines={2}>
                {accountRoleLabel} · {accountEmail}
              </Text>
            ) : null}
          </View>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#0EA5FF',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  coverWrap: { position: 'relative' },
  coverImage: { width: '100%', height: 160 },
  notifBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
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
  notifBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  coverEditBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#0EA5FF',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  coverEditText: { fontSize: 12, fontWeight: '800' },
  heroBody: { paddingHorizontal: 14, paddingBottom: 14 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: -36 },
  avatarPress: { position: 'relative' },
  avatarRing: {
    borderWidth: 4,
    borderRadius: 48,
    padding: 2,
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: { flex: 1, paddingBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '900', marginBottom: 6 },
  typeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  heroSub: { fontSize: 13, lineHeight: 18 },
  accountLine: { fontSize: 12, fontWeight: '800', marginTop: 6 },
});
