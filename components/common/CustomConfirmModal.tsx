import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export type CustomConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CustomConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: CustomConfirmModalProps) {
  const theme = useAppTheme();
  const { isRTL } = useI18n();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        },
        card: {
          width: '100%',
          maxWidth: 420,
          borderRadius: theme.radiusMd,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.35,
          shadowRadius: 24,
          elevation: 12,
        },
        title: {
          color: theme.text,
          fontSize: 20,
          fontWeight: '800',
          lineHeight: 28,
          textAlign: isRTL ? 'right' : 'left',
        },
        message: {
          marginTop: 10,
          color: theme.textMuted,
          fontSize: 15,
          lineHeight: 23,
          textAlign: isRTL ? 'right' : 'left',
        },
        actions: {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12,
          marginTop: 22,
        },
        cancelBtn: {
          minHeight: 44,
          paddingHorizontal: 14,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cancelText: {
          color: theme.textMuted,
          fontSize: 15,
          fontWeight: '700',
        },
        confirmBtn: {
          minHeight: 44,
          minWidth: 148,
          borderRadius: theme.radiusSm,
          paddingHorizontal: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: destructive ? theme.danger : theme.accent,
          opacity: busy ? 0.72 : 1,
        },
        confirmText: {
          color: destructive ? theme.white : theme.onAccent,
          fontSize: 14,
          fontWeight: '800',
          textAlign: 'center',
        },
      }),
    [busy, destructive, isRTL, theme],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onCancel}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              disabled={busy}
              onPress={onCancel}
              style={({ pressed }) => [styles.cancelBtn, pressed ? { opacity: 0.72 } : null]}
              accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              style={styles.confirmBtn}
              accessibilityRole="button">
              {busy ? (
                <ActivityIndicator color={destructive ? theme.white : theme.onAccent} size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
