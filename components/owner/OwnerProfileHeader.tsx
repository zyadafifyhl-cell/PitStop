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
  onOpenSettings?: () => void;
  settingsLabel?: string;
};

const COVER_HEIGHT = 150;
const AVATAR_SIZE = 80;

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
  onOpenSettings,
  settingsLabel,
}: Props) {
  return (
    <View
      style={[
        styles.heroCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: theme.shadowColor,
        },
      ]}>
      {/* Cover banner — controls only; no shop text on the image */}
      <View style={styles.coverWrap}>
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
        ) : (
          <View style={[styles.coverImage, { backgroundColor: theme.bgElevated }]} />
        )}
        {onOpenSettings ? (
          <Pressable
            onPress={onOpenSettings}
            style={[styles.notifBtn, styles.settingsBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            accessibilityLabel={settingsLabel}>
            <FontAwesome name="cog" size={16} color={theme.text} />
          </Pressable>
        ) : null}
        {onOpenNotifications ? (
          <Pressable
            onPress={onOpenNotifications}
            style={({ pressed }) => [
              styles.notifBtn,
              {
                backgroundColor: notificationCount > 0 ? 'rgba(30, 90, 230, 0.20)' : theme.card,
                borderColor: notificationCount > 0 ? 'rgba(96, 165, 250, 0.55)' : theme.border,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
            accessibilityLabel={notificationsLabel}>
            <FontAwesome
              name={notificationCount > 0 ? 'bell' : 'bell-o'}
              size={17}
              color={notificationCount > 0 ? '#60A5FA' : theme.textMuted}
            />
            {notificationCount > 0 ? (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {notificationCount > 99 ? '99+' : String(notificationCount)}
                </Text>
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

      {/* Body: avatar overlaps banner edge; all text sits on card background below */}
      <View style={[styles.heroBody, { backgroundColor: theme.card }]}>
        <Pressable
          onPress={onEditProfile}
          disabled={pickingImage}
          style={[
            styles.avatarFloat,
            { marginLeft: 16, borderColor: theme.bg, backgroundColor: theme.bg },
          ]}>
          <View style={[styles.avatarRing, { borderColor: theme.card, backgroundColor: theme.card }]}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.bgElevated }]}>
                <FontAwesome name="building" size={26} color={theme.textDim} />
              </View>
            )}
          </View>
          <View style={[styles.avatarBadge, { backgroundColor: theme.accent, borderColor: theme.card }]}>
            <FontAwesome name="pencil" size={10} color={theme.onAccent} />
          </View>
        </Pressable>

        <View style={styles.detailsBlock}>
          <Text style={[styles.heroTitle, { color: theme.text }]} numberOfLines={2}>
            {shopName}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: theme.brandSoft }]}>
            <Text style={[styles.typeBadgeText, { color: theme.brand }]}>{typeLabel}</Text>
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
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  coverWrap: { position: 'relative' },
  coverImage: { width: '100%', height: COVER_HEIGHT },
  notifBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: { right: 62 },
  notifBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0E1726',
    backgroundColor: '#1E5AE6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 4,
  },
  notifBadgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 13, fontWeight: '800' },
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
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0,
  },
  coverEditText: { fontSize: 12, fontWeight: '800' },
  heroBody: {
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  avatarFloat: {
    marginTop: -(AVATAR_SIZE / 2),
    alignSelf: 'flex-start',
    borderWidth: 4,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    position: 'relative',
    zIndex: 2,
  },
  avatarRing: {
    borderWidth: 3,
    borderRadius: AVATAR_SIZE / 2 + 3,
    padding: 2,
    overflow: 'hidden',
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsBlock: {
    marginTop: 8,
    gap: 6,
  },
  heroTitle: { fontSize: 20, fontWeight: '900' },
  typeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  heroSub: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  accountLine: { fontSize: 12, fontWeight: '800', marginTop: 2 },
});
