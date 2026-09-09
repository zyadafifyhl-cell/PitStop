import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function PitStopButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
}: Props) {
  const theme = useAppTheme();
  const blocked = disabled || loading;
  const colors =
    variant === 'primary'
      ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent }
      : variant === 'danger'
        ? { backgroundColor: theme.dangerSoft, borderColor: theme.danger, color: theme.danger }
        : variant === 'ghost'
          ? { backgroundColor: 'transparent', borderColor: 'transparent', color: theme.text }
          : { backgroundColor: theme.cardHover, borderColor: theme.chipBorder, color: theme.text };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: theme.buttonHeight,
          borderRadius: theme.radiusBtn,
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          opacity: blocked ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={colors.color} size="small" /> : icon}
      <Text style={[styles.label, { color: colors.color }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: 'transparent',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
