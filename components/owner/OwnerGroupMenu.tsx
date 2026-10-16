import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export type OwnerGroupItem = {
  id: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  lead: string;
  badge?: number;
};

type MenuProps = {
  title?: string;
  groups: readonly OwnerGroupItem[];
  onOpen: (id: string) => void;
};

export function OwnerGroupMenu({ title, groups, onOpen }: MenuProps) {
  const theme = useAppTheme();
  const { isRTL } = useI18n();

  return (
    <View style={styles.list}>
      {title ? (
        <Text style={[styles.heading, { color: theme.text }, isRTL && styles.rtlText]}>{title}</Text>
      ) : null}
      {groups.map((group) => {
        const badge = group.badge && group.badge > 0 ? group.badge : 0;
        return (
          <Pressable
            key={group.id}
            onPress={() => onOpen(group.id)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              isRTL && styles.rowRtl,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: pressed ? 0.86 : 1,
              },
            ]}>
            <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
              <MaterialCommunityIcons name={group.icon} size={22} color={theme.accent} />
              {badge ? (
                <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
                  <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtlText]}>{group.title}</Text>
              <Text style={[styles.lead, { color: theme.textMuted }, isRTL && styles.rtlText]} numberOfLines={2}>
                {group.lead}
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isRTL ? 'chevron-left' : 'chevron-right'}
              size={22}
              color={theme.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

type BackProps = {
  title: string;
  onBack: () => void;
};

export function OwnerGroupBackBar({ title, onBack }: BackProps) {
  const theme = useAppTheme();
  const { isRTL, t } = useI18n();

  return (
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={t('owner_group_back')}
      style={({ pressed }) => [
        styles.back,
        isRTL && styles.rowRtl,
        { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.86 : 1 },
      ]}>
      <MaterialCommunityIcons name={isRTL ? 'chevron-right' : 'chevron-left'} size={22} color={theme.accent} />
      <View style={styles.copy}>
        <Text style={[styles.backHint, { color: theme.textMuted }, isRTL && styles.rtlText]}>{t('owner_group_back')}</Text>
        <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtlText]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginTop: 4 },
  heading: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowRtl: { flexDirection: 'row-reverse' },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
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
    borderWidth: 2,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: '800' },
  lead: { fontSize: 13, lineHeight: 18 },
  rtlText: { textAlign: 'right' },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  backHint: { fontSize: 12, fontWeight: '700' },
});
