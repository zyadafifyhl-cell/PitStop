import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  count: number;
  liked: boolean;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
};

export function LikeButton({ count, liked, label, onPress, disabled, compact }: Props) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.btn,
        compact && styles.btnCompact,
        {
          borderColor: liked ? theme.accent : theme.border,
          backgroundColor: liked ? theme.accentSoft : theme.bgElevated,
          opacity: disabled ? 0.6 : 1,
        },
      ]}>
      <FontAwesome name={liked ? 'heart' : 'heart-o'} size={compact ? 14 : 15} color={liked ? theme.accent : theme.textMuted} />
      <Text style={[styles.count, { color: liked ? theme.accent : theme.textMuted }]}>
        {label ? `${label} · ${count}` : String(count)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
});
