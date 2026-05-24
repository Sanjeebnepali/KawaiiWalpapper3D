import { Alert, Platform, ToastAndroid } from 'react-native';

export const SUPPORT_EMAIL = 'support@kawaiibaby.com';
export const TERMS_URL = 'https://example.com/kawaii/terms';
export const PRIVACY_URL = 'https://example.com/kawaii/privacy';
export const STORE_URL = 'https://example.com/kawaii/store';

export const RESOLUTION_OPTIONS = ['HD (720p)', 'Full HD (1080p)', '2K', '4K'];
export const QUALITY_OPTIONS = ['Fast', 'Balanced', 'High Quality', 'Ultra'];

export function toast(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}
