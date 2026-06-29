import { Alert, Platform } from 'react-native';

/** Works on web where Alert.alert is often invisible. */
export function userAlert(title: string, message?: string): void {
  const body = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(body);
    return;
  }
  Alert.alert(title, message);
}

type UserConfirmOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Cancel/confirm dialog — uses window.confirm on web (Alert buttons are unreliable there). */
export function userConfirm(title: string, message: string, options?: UserConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const body = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(body));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
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
  });
}
