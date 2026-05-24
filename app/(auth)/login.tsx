import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { styles } from '../../components/authLogin/styles';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { classifyAuthError } from '../../lib/authErrors';
import { useAuthStore } from '../../store/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

type Mode = 'signin' | 'signup';

export default function Login() {
  const router = useRouter();
  const theme = useTheme();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const pwValid = password.length >= MIN_PASSWORD;
  const valid = emailValid && pwValid;

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
  };

  const onSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);

    const trimmed = email.trim().toLowerCase();
    const { error: err } =
      mode === 'signup'
        ? await signUp(trimmed, password)
        : await signIn(trimmed, password);

    if (err) {
      setSubmitting(false);
      const friendly = classifyAuthError(err);
      setError(friendly?.message ?? err);
      return;
    }

    // Auth succeeded → session is live. onAuthStateChange already fired
    // refreshProfile, but that's async — pull it inline so the gate below
    // reads a settled profile (mirrors the old verify.tsx logic).
    await refreshProfile();
    setSubmitting(false);

    // Profile-completion gate (change #044). A brand-new account lands here
    // with display_name = null and must finish profile-setup before reaching
    // the gated feature. Only force it when refreshProfile RESOLVED a row whose
    // display_name is genuinely null — a null `profile` means the fetch failed,
    // not "incomplete", so we let those through (refreshProfile already retried).
    const profile = useAuthStore.getState().profile;
    if (profile && !profile.display_name) {
      router.replace({
        pathname: '/(auth)/profile-setup',
        params: returnTo ? { returnTo } : {},
      });
      return;
    }

    if (returnTo) router.replace(returnTo as Href);
    else router.back();
  };

  const title = mode === 'signup' ? 'Create account' : 'Welcome back';
  const sub =
    mode === 'signup'
      ? 'Pick an email and a password. No code to wait for.'
      : 'Sign in with your email and password.';
  const cta = mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.head}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={[styles.glyph, { backgroundColor: theme.primary }]}>
            <Ionicons name="heart" size={24} color="#131313" />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>

          {/* Mode toggle — Sign in vs Create account */}
          <View style={styles.segment}>
            <Pressable
              onPress={() => switchMode('signin')}
              style={[
                styles.segmentBtn,
                mode === 'signin' && { backgroundColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: mode === 'signin' ? '#131313' : Colors.textDim },
                ]}
              >
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => switchMode('signup')}
              style={[
                styles.segmentBtn,
                mode === 'signup' && { backgroundColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: mode === 'signup' ? '#131313' : Colors.textDim },
                ]}
              >
                Create account
              </Text>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Ionicons name="mail-outline" size={18} color={Colors.textDim} />
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={Colors.textMute}
              style={styles.input}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(null);
              }}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Ionicons name="lock-closed-outline" size={18} color={Colors.textDim} />
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              autoCorrect={false}
              secureTextEntry={!showPw}
              placeholder="Password (min 6 characters)"
              placeholderTextColor={Colors.textMute}
              style={styles.input}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={10}>
              <Ionicons
                name={showPw ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={Colors.textDim}
              />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedButton
            onPress={onSubmit}
            disabled={!valid || submitting}
            style={[
              styles.btn,
              { backgroundColor: theme.primary, opacity: !valid || submitting ? 0.5 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#131313" />
            ) : (
              <Text style={styles.btnText}>{cta}</Text>
            )}
          </AnimatedButton>

          <Text style={styles.footnote}>
            By continuing you agree to the Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
