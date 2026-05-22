import { Alert, Platform, ToastAndroid } from 'react-native';

/**
 * Cross-platform lightweight toast.
 *
 * - Android: native `ToastAndroid` (non-blocking).
 * - iOS / web: `Alert` (no Toast on iOS — Alert is the conventional fallback).
 *
 * Empty messages are no-ops, so helpers can return `{ ok: true, message: '' }`
 * when a UI other than a toast (e.g. the system share sheet) provides feedback.
 */
export function toast(message: string) {
  if (!message) return;
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
}
