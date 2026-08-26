import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';

export type HistoryMenuAction = {
  id: string;
  label: string;
  destructive?: boolean;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  onPress: () => void;
};

type MenuProps = {
  visible: boolean;
  actions: HistoryMenuAction[];
  onClose: () => void;
};

/** Compact anchored dropdown — must sit inside a `position: 'relative'` parent. */
export function HistoryOverflowMenu({ visible, actions, onClose }: MenuProps) {
  const theme = useAppTheme();
  const { effectivePreference } = useThemePreference();
  if (!visible) return null;

  const dark = effectivePreference === 'dark';
  return (
    <View
      style={[
        styles.dropdown,
        {
          backgroundColor: dark ? '#161f30' : theme.card,
          borderColor: dark ? '#2d3748' : theme.border,
        },
      ]}>
      {actions.map((action) => {
        const color = action.destructive ? theme.danger : theme.text;
        const icon = action.icon ?? (action.destructive ? 'ban' : 'trash-o');
        return (
          <Pressable
            key={action.id}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
            <FontAwesome name={icon} size={13} color={color} style={styles.rowIcon} />
            <Text style={[styles.label, { color }]} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type AnchorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: HistoryMenuAction[];
  accessibilityLabel: string;
};

/** 3-dots button + absolutely positioned dropdown, wrapped in a relative anchor. */
export function HistoryCardMenu({ open, onOpenChange, actions, accessibilityLabel }: AnchorProps) {
  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <HistoryMoreButton
        accessibilityLabel={accessibilityLabel}
        onPress={() => onOpenChange(!open)}
      />
      <HistoryOverflowMenu
        visible={open}
        actions={actions}
        onClose={() => onOpenChange(false)}
      />
    </View>
  );
}

export function HistoryMoreButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <FontAwesome name="ellipsis-v" size={16} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    zIndex: 1000,
    width: 34,
    height: 34,
  },
  dropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 180,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 1000,
    elevation: 5,
    paddingVertical: 4,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowIcon: {
    width: 16,
    textAlign: 'center',
  },
  label: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
