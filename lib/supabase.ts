import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Read from `.env` via Expo's `EXPO_PUBLIC_*` convention. Values are inlined
// into the JS bundle at Metro build time — restart `expo start --clear` after
// changing `.env`, otherwise the old values stay baked in.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env, fill the values, and restart Metro with --clear.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL session detection — we're using OTP codes, not magic-link URLs.
    detectSessionInUrl: false,
  },
});
