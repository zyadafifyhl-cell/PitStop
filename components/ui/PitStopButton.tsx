import React, { useState } from 'react';
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
  const [focused, setFocused] = useState(false);
  const blocked = disabled || loading;
  const colors =
    variant === 'primary'
      ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent }
      : variant === 'danger'
        ? { backgroundColor: theme.dangerSoft, borderColor: theme.danger, color: theme.danger }
        : variant === 'ghost'
          ? { backgroundColor: 'transparent', borderColor: 'transparent', color: theme.text }
          : { backgroundColor: 'rgba(30, 90, 230, 0.06)', borderColor: 'rgba(30, 90, 230, 0.40)', color: theme.warm };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: theme.buttonHeight,
          borderRadius: theme.radiusBtn,
          backgroundColor:
            pressed && variant === 'primary'
              ? theme.accentHover
              : pressed && variant === 'secondary'
                ? 'rgba(30, 90, 230, 0.15)'
                : colors.backgroundColor,
          borderColor: focused ? theme.accent : colors.borderColor,
          borderTopColor: variant === 'primary' ? 'rgba(255, 255, 255, 0.20)' : undefined,
          opacity: blocked ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          shadowColor: focused ? theme.focusRing : 'transparent',
          shadowOpacity: focused ? 1 : 0,
          shadowRadius: 0,
          shadowOffset: { width: 0, height: 0 },
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
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
