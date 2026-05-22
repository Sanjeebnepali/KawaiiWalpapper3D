import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { AVATARS, DEFAULT_AVATAR_ID, getAvatar } from '../../constants/avatars';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/auth';

/**
 * Profile-setup screen — dual-use:
 *   - Signup mode (`isEdit !== '1'`): mandatory, no back arrow. Routed to from
 *     login.tsx when `profile.display_name` is null after a fresh sign-up.
 *   - Edit mode  (`isEdit === '1'`): launched from Settings' pencil button.
 *     Pre-fills current values, allows back/cancel.
 *
 * Either way, success writes to `public.profiles` via Supabase and refreshes
 * the auth-store profile cache, then pops/replaces back to `returnTo` or home.
 */
export default function ProfileSetup() {
  const router = useRouter();
  const theme = useTheme();
  const { returnTo, isEdit } = useLocalSearchParams<{
    returnTo?: string;
    isEdit?: string;
  }>();
  const editMode = isEdit === '1';

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [avatarId, setAvatarId] = useState(profile?.avatar_id ?? DEFAULT_AVATAR_ID);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 1 && name.trim().length <= 32;

  const onSave = async () => {
    if (!valid || submitting || !user) return;
    setSubmitting(true);
    setError(null);

    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim(),
        avatar_id: avatarId,
      })
      .eq('id', user.id);

    if (err) {
      setSubmitting(false);
      setError(err.message);
      return;
    }

    // Pull the fresh row into the in-memory store so the gate condition
    // (display_name != null) updates immediately for subsequent navigations.
    await refreshProfile();
    setSubmitting(false);

    if (returnTo) router.replace(returnTo as Href);
    else if (editMode) router.back();
    else router.replace('/(tabs)');
  };

  const onCancel = () => {
    if (!editMode) return; // mandatory in signup mode
    router.back();
  };

  const selected = getAvatar(avatarId);

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
          {editMode ? (
            <Pressable onPress={onCancel} hitSlop={12} style={styles.back}>
              <Ionicons name="chevron-back" size={22} color={Colors.text} />
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Preview avatar — updates live as the user taps tiles. */}
          <View style={styles.previewWrap}>
            <View style={[styles.previewAvatar, { backgroundColor: selected.color }]}>
              <Text style={styles.previewEmoji}>{selected.emoji}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            {editMode ? 'Edit your profile' : 'One last step'}
          </Text>
          <Text style={styles.sub}>
            Pick a name and an avatar. You can change these later in Settings.
          </Text>

          <Text style={styles.fieldLabel}>Display name</Text>
          <View style={styles.field}>
            <Ionicons name="person-outline" size={18} color={Colors.textDim} />
            <TextInput
              autoFocus={!editMode}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={32}
              placeholder="What should we call you?"
              placeholderTextColor={Colors.textMute}
              style={styles.input}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (error) setError(null);
              }}
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Avatar</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a) => {
              const isSelected = a.id === avatarId;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setAvatarId(a.id)}
                  style={styles.tileWrap}
                >
                  <View
                    style={[
                      styles.tile,
                      { backgroundColor: a.color },
                      isSelected && { borderColor: theme.primary, borderWidth: 3 },
                    ]}
                  >
                    <Text style={styles.tileEmoji}>{a.emoji}</Text>
                    {isSelected ? (
                      <View style={[styles.checkBadge, { backgroundColor: theme.primary }]}>
                        <Ionicons name="checkmark" size={12} color="#131313" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.tileLabel}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedButton
            onPress={onSave}
            disabled={!valid || submitting}
            style={[
              styles.btn,
              { backgroundColor: theme.primary, opacity: !valid || submitting ? 0.5 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#131313" />
            ) : (
              <Text style={styles.btnText}>
                {editMode ? 'Save' : 'Continue'}
              </Text>
            )}
          </AnimatedButton>

          {!editMode ? (
            <Pressable
              onPress={() =>
                premiumAlert({
                  title: 'Set up later?',
                  message:
                    'Couple Theme and AI Generator need a display name. You can come back here, but features stay locked until this is done.',
                  icon: 'lock-closed-outline',
                  buttons: [{ text: 'OK', style: 'cancel' }],
                })
              }
              hitSlop={8}
              style={styles.helpLink}
            >
              <Text style={styles.helpText}>Why is this required?</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const TILE_GAP = 12;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  head: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, height: 48 },
  back: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  previewWrap: { alignItems: 'center', marginBottom: Spacing.md },
  previewAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: { fontSize: 48 },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sub: {
    color: Colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15 },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
    justifyContent: 'space-between',
  },
  tileWrap: { width: `${(100 - 3) / 4}%`, alignItems: 'center', gap: 6 },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileEmoji: { fontSize: 28 },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  tileLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  error: {
    color: '#FF7A6E',
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  btnText: { color: '#131313', fontSize: 15, fontWeight: '800' },
  helpLink: { alignItems: 'center', paddingVertical: 12 },
  helpText: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
});
