import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  const compact = tabs.length >= 5;

  return (
    <View style={[styles.container, { backgroundColor: theme.bgElevated, borderTopColor: theme.border }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const color = active ? theme.brand : theme.textDim;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, compact && styles.itemCompact]}>
            <MaterialCommunityIcons name={NAV_ICONS[tab.icon]} size={22} color={color} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[styles.label, compact && styles.labelCompact, { color }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: 72,
    flexDirection: 'row',
    borderTopWidth: 1,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 9,
  },
  itemCompact: {
    paddingHorizontal: 2,
    paddingVertical: 8,
  },
  label: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  labelCompact: {
    marginTop: 4,
    fontSize: 9,
  },
});
