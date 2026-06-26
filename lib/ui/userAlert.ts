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
