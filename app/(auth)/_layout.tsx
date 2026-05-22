import { Stack } from 'expo-router';

/** Auth route group — headerless stack. Login (email+password) -> Profile-setup. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'simple_push',
      }}
    />
  );
}
