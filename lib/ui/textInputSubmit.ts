import { Platform, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';

type Options = {
  enabled?: boolean;
  onSubmit: () => void;
};

/**
 * Makes a TextInput submit on keyboard Go/Done and on Enter (web).
 * A short lock prevents onSubmitEditing + onKeyPress from firing twice.
 */
export function textInputSubmitProps({ enabled = true, onSubmit }: Options) {
  let locked = false;

  const submit = () => {
    if (!enabled || locked) return;
    locked = true;
    onSubmit();
    queueMicrotask(() => {
      locked = false;
    });
  };

  return {
    returnKeyType: 'go' as const,
    blurOnSubmit: true,
    onSubmitEditing: submit,
    onKeyPress: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (Platform.OS === 'web' && event.nativeEvent?.key === 'Enter') {
        submit();
      }
    },
  };
}
