import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  type AlertButton,
  type AlertOptions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type DialogController = {
  show: (request: Omit<DialogRequest, 'id'>) => void;
};

const DEFAULT_NATIVE_ALERT = Alert.alert.bind(Alert);

let controller: DialogController | null = null;
let requestId = 0;

function setDialogController(next: DialogController | null) {
  controller = next;
}

function normalizeButtons(buttons?: readonly AlertButton[]): AlertButton[] {
  if (!buttons || buttons.length === 0) {
    return [{ text: 'OK' }];
  }
  return buttons.map((button) => ({ ...button }));
}

function dispatchDialog(request: Omit<DialogRequest, 'id'>): boolean {
  if (!controller) return false;
  controller.show(request);
  return true;
}

export function showAppAlert(title: string, message?: string): void {
  const shown = dispatchDialog({
    title,
    message,
    buttons: [{ text: 'OK' }],
  });
  if (!shown) {
    DEFAULT_NATIVE_ALERT(title, message);
  }
}

type ConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
};

export function showAppConfirm(title: string, message: string, options?: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const shown = dispatchDialog({
      title,
      message,
      buttons: [
        {
          text: options?.cancelLabel ?? 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: options?.confirmLabel ?? 'OK',
          onPress: () => resolve(true),
        },
      ],
      options: { cancelable: false },
    });

    if (!shown) {
      DEFAULT_NATIVE_ALERT(title, message, [
        {
          text: options?.cancelLabel ?? 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: options?.confirmLabel ?? 'OK',
          onPress: () => resolve(true),
        },
      ]);
    }
  });
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const active = queue[0] ?? null;
  const theme = useAppTheme();
  const { isRTL, t } = useI18n();

  const enqueue = useCallback((request: Omit<DialogRequest, 'id'>) => {
    setQueue((prev) => [
      ...prev,
      {
        id: ++requestId,
        ...request,
        title: request.title ?? '',
        buttons: normalizeButtons(request.buttons),
      },
    ]);
  }, []);

  const closeActive = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const pressButton = useCallback(
    (button: AlertButton) => {
      closeActive();
      try {
        button.onPress?.();
      } catch {
        // Keep the dialog system resilient; action handlers own their errors.
      }
    },
    [closeActive],
  );

  const dismissViaBackdrop = useCallback(() => {
    if (!active?.options?.cancelable) return;
    const cancelButton = active.buttons.find((button) => button.style === 'cancel');
    if (cancelButton) {
      pressButton(cancelButton);
      return;
    }
    closeActive();
  }, [active, closeActive, pressButton]);

  useEffect(() => {
    setDialogController({ show: enqueue });
    return () => {
      setDialogController(null);
    };
  }, [enqueue]);

  useEffect(() => {
    const previous = Alert.alert;
    (Alert as { alert: typeof Alert.alert }).alert = ((title, message, buttons, options) => {
      enqueue({
        title: typeof title === 'string' ? title : '',
        message,
        buttons: normalizeButtons(buttons),
        options,
      });
    }) as typeof Alert.alert;

    return () => {
      (Alert as { alert: typeof Alert.alert }).alert = previous;
    };
  }, [enqueue]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(2, 6, 12, 0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          zIndex: 9999,
          elevation: 9999,
        },
        card: {
          width: '100%',
          maxWidth: 440,
          borderRadius: theme.radiusMd,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.bgElevated,
          padding: 18,
          gap: 12,
        },
        title: {
          color: theme.text,
          fontSize: 19,
          fontWeight: '800',
          textAlign: isRTL ? 'right' : 'left',
        },
        message: {
          color: theme.textMuted,
          fontSize: 15,
          lineHeight: 22,
          textAlign: isRTL ? 'right' : 'left',
        },
        buttonRow: {
          flexDirection: isRTL ? 'row-reverse' : 'row',
          gap: 10,
          marginTop: 6,
        },
        buttonBase: {
          flex: 1,
          minHeight: 44,
          borderRadius: theme.radiusSm,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
        },
        buttonDefault: {
          backgroundColor: theme.accent,
          borderColor: theme.accent,
        },
        buttonCancel: {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        buttonDanger: {
          backgroundColor: theme.dangerSoft,
          borderColor: theme.danger,
        },
        buttonTextDefault: {
          color: theme.onAccent,
          fontWeight: '700',
          fontSize: 14,
        },
        buttonTextCancel: {
          color: theme.text,
          fontWeight: '700',
          fontSize: 14,
        },
        buttonTextDanger: {
          color: theme.danger,
          fontWeight: '700',
          fontSize: 14,
        },
      }),
    [isRTL, theme],
  );

  return (
    <>
      {children}
      <Modal
        visible={!!active}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={dismissViaBackdrop}>
        <Pressable style={styles.backdrop} onPress={dismissViaBackdrop}>
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            {!!active?.title && <Text style={styles.title}>{active.title}</Text>}
            {!!active?.message && <Text style={styles.message}>{active.message}</Text>}
            <View style={styles.buttonRow}>
              {(active?.buttons ?? []).map((button, index) => {
                const isCancel = button.style === 'cancel';
                const isDanger = button.style === 'destructive';
                const buttonStyle = isDanger ? styles.buttonDanger : isCancel ? styles.buttonCancel : styles.buttonDefault;
                const textStyle = isDanger
                  ? styles.buttonTextDanger
                  : isCancel
                    ? styles.buttonTextCancel
                    : styles.buttonTextDefault;
                const fallbackLabel = isCancel ? t('alert_cancel') : t('band_ok');

                return (
                  <Pressable
                    key={`${active?.id ?? 0}-${button.text ?? 'btn'}-${index}`}
                    style={[styles.buttonBase, buttonStyle]}
                    onPress={() => pressButton(button)}>
                    <Text style={textStyle}>{button.text ?? fallbackLabel}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
