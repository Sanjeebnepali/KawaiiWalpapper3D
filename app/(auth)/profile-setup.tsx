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
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { styles } from '../../components/profileSetup/styles';
import { AVATARS, DEFAULT_AVATAR_ID, getAvatar } from '../../constants/avatars';
import { Colors, Spacing } from '../../constants/theme';
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
