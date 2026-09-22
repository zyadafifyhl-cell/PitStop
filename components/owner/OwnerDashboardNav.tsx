import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { OwnerNavIconId } from '@/lib/owner/dashboardConfig';

export type OwnerDashboardTab<T extends string = string> = {
  id: T;
  label: string;
  icon: OwnerNavIconId;
};

type Props<T extends string> = {
  tabs: readonly OwnerDashboardTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
};

const NAV_ICONS: Record<OwnerNavIconId, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  overview: 'view-dashboard-outline',
  management: 'calendar-clock',
  'management-store': 'clipboard-list-outline',
  'catalog-service': 'wrench-outline',
  'catalog-store': 'layers-outline',
  profile: 'account-outline',
  settings: 'cog-outline',
};

export function OwnerDashboardNav<T extends string>({ tabs, activeTab, onChange }: Props<T>) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: theme.bg,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: theme.shadowColor,
          },
        ]}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const color = active ? theme.accent : theme.textMuted;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
              <View style={[styles.iconWrap, active && { backgroundColor: theme.accentSoft }]}>
                <MaterialCommunityIcons name={NAV_ICONS[tab.icon]} size={20} color={color} />
              </View>
              <Text numberOfLines={1} style={[styles.label, { color }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' } as object)
      : null),
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  itemPressed: { opacity: 0.72 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
