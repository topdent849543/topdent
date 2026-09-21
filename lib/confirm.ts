import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation dialog.
 *
 * React Native's Alert.alert() only supports a single "OK" button on web
 * (react-native-web maps it to window.alert, which ignores the extra
 * buttons/onPress callbacks). That means any "Cancel/Delete" confirmation
 * built with Alert.alert() silently does nothing on web — the delete
 * button never actually fires.
 *
 * This helper uses window.confirm() on web and Alert.alert() on native,
 * so onConfirm always runs when the user confirms, on every platform.
 */
export function confirmAction(options: ConfirmOptions, onConfirm: () => void) {
  const {
    title,
    message,
    confirmText = 'Delete',
    cancelText = 'Cancel',
    destructive = true,
  } = options;

  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelText, style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
