import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

export type OwnerDashboardTab<T extends string = string> = {
  id: T;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
};

type Props<T extends string> = {
  tabs: readonly OwnerDashboardTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
};

export function OwnerDashboardNav<T extends string>({ tabs, activeTab, onChange }: Props<T>) {
  const theme = useAppTheme();
  const compact = tabs.length >= 5;

  return (
    <View style={[styles.container, { backgroundColor: theme.bgElevated, borderTopColor: theme.border }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, compact && styles.itemCompact]}>
            <FontAwesome name={tab.icon} size={compact ? 17 : 19} color={active ? theme.accent : theme.textDim} />
            <Text
              numberOfLines={1}
              style={[styles.label, compact && styles.labelCompact, { color: active ? theme.accent : theme.textDim }]}>
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
    minHeight: 68,
    flexDirection: 'row',
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
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
