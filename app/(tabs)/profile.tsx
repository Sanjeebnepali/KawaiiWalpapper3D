import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { PremiumModal } from '../../components/PremiumModal';
import { PremiumSheet } from '../../components/PremiumSheet';
import {
  RowValue,
  SettingsRow,
  SettingsSection,
  Toggle,
} from '../../components/SettingsControls';
import { Slider } from '../../components/Slider';
import { ThemeModal } from '../../components/ThemeModal';
import { getAvatar } from '../../constants/avatars';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { DEFAULT_HF_TOKEN } from '../../lib/ai/defaults';
import { isUsingUserHFToken } from '../../lib/ai/providers/huggingface';
import { getProvider } from '../../lib/ai/registry';
import {
  openAutostartSettings,
  openBatteryOptimization,
} from '../../lib/backgroundAccess';
import { startForegroundShuffleForCollection } from '../../lib/shuffleActions';
import { clearAppCache } from '../../lib/wallpaperActions';
import { useAIStore } from '../../store/ai';
import { useAuthStore } from '../../store/auth';
import { useFavoritesStore } from '../../store/favorites';
import { useSettingsStore } from '../../store/settings';
import { useShuffleStore } from '../../store/shuffle';

const SUPPORT_EMAIL = 'support@kawaiibaby.com';
const TERMS_URL = 'https://example.com/kawaii/terms';
const PRIVACY_URL = 'https://example.com/kawaii/privacy';
const STORE_URL = 'https://example.com/kawaii/store';

const RESOLUTION_OPTIONS = ['HD (720p)', 'Full HD (1080p)', '2K', '4K'];
const QUALITY_OPTIONS = ['Fast', 'Balanced', 'High Quality', 'Ultra'];

function toast(msg: string) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

export default function Settings() {
  const router = useRouter();
  // Per-field selectors so each toggle re-renders only the row it owns.
  // Previously `useSettingsStore()` subscribed the whole screen — flipping
  // Auto Download re-rendered all 7 sections + slider + 3 modal trees.
  const theme_ = useSettingsStore((st) => st.theme);
  const autoDownload = useSettingsStore((st) => st.autoDownload);
  const saveToGallery = useSettingsStore((st) => st.saveToGallery);
  const resolution = useSettingsStore((st) => st.resolution);
  const liveWallpaper = useSettingsStore((st) => st.liveWallpaper);
  const showSetButton = useSettingsStore((st) => st.showSetButton);
  const featuredFolder = useSettingsStore((st) => st.featuredFolder);
  const generateQuality = useSettingsStore((st) => st.generateQuality);
  const autoSaveGenerated = useSettingsStore((st) => st.autoSaveGenerated);
  const newWallpaperAlerts = useSettingsStore((st) => st.newWallpaperAlerts);
  const dailyRecommendation = useSettingsStore((st) => st.dailyRecommendation);
  const vibrationOnDownload = useSettingsStore((st) => st.vibrationOnDownload);
  const setSetting = useSettingsStore((st) => st.set);

  const favIds = useFavoritesStore((st) => st.ids);
  const clearFavorites = useFavoritesStore((st) => st.clear);
  const theme = useTheme();

  // Auth — drives the profile header + the Logout button below.
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const authStatus = useAuthStore((s) => s.status);
  const signOut = useAuthStore((s) => s.signOut);

  const themeModal = useRef<BottomSheetModal>(null);
  const resolutionModal = useRef<BottomSheetModal>(null);
  const qualityModal = useRef<BottomSheetModal>(null);
  const aiTokenSheet = useRef<BottomSheetModal>(null);

  // AI token row — reads from the AI store, which is its own slice so
  // wiring is uniform if/when we add paid providers (each gets its own
  // token field; this row stays focused on the active provider).
  //
  // Two-token model:
  //   - DEFAULT_HF_TOKEN is baked into the build. Works for everyone.
  //   - user `hfToken` overrides it for power users who want their own
  //     quota / account.
  // Settings row shows which one is currently active.
  const hfToken = useAIStore((s) => s.hfToken);
  const pollToken = useAIStore((s) => s.pollToken);
  const providerId = useAIStore((s) => s.providerId);
  const setHFToken = useAIStore((s) => s.setHFToken);
  const setPollToken = useAIStore((s) => s.setPollToken);
  const aiProvider = getProvider(providerId);
  // Pollinations (the free default) needs no token — a token is an
  // OPTIONAL speed upgrade (anon tier 1 img/15s → seed tier 1 img/5s).
  // HF needs a token (or the baked-in default). The one row adapts.
  const isPoll = providerId === 'pollinations';
  const [tokenDraft, setTokenDraft] = useState('');
  // What the right side of the row should read.
  const tokenStatus = isPoll
    ? pollToken
      ? `${pollToken.slice(0, 3)}…${pollToken.slice(-4)}`
      : 'Free · no token'
    : hfToken
      ? `${hfToken.slice(0, 3)}…${hfToken.slice(-4)}`
      : DEFAULT_HF_TOKEN
        ? 'App default'
        : 'Not set';

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const exportData = () => {
    const json = JSON.stringify({ favorites: favIds }, null, 2);
    Share.share({ message: json, title: 'Kawaii favorites export' });
  };

  const confirmDelete = () =>
    premiumAlert({
      title: 'Delete Account',
      message:
        'This signs you out and wipes the favorites + AI history saved on this device. The server-side account stays for now — email support to fully remove it.',
      icon: 'warning-outline',
      accentColor: '#FF7A6E',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete local data',
          style: 'destructive',
          onPress: async () => {
            // Local-side wipe — favorites + AI history + auth session.
            // Doesn't reach into the Supabase `profiles` table; a true
            // server-side delete needs an admin endpoint we haven't
            // built yet. The toast tells the user what actually
            // happened so they're not misled.
            clearFavorites();
            await useAIStore.getState().resetAll();
            try {
              await signOut();
            } catch {
              /* in-memory wipe still succeeded */
            }
            toast('Local data cleared · signed out');
          },
        },
      ],
    });

  const onClearCache = async () => {
    const r = await clearAppCache();
    if (!r.ok) {
      toast('Could not clear cache');
      return;
    }
    // Clearing the cache deletes the precached `kawaii-*.jpg` pool the
    // native foreground service rotates through — every subsequent
    // decodeFile would return null and silently apply nothing. If a shuffle
    // is active, re-precache + re-arm it so the file:// pool is re-downloaded
    // and rotation doesn't die quietly until the next app reopen.
    const { activeCollectionId, collections } = useShuffleStore.getState();
    if (activeCollectionId) {
      const active = collections.find((c) => c.id === activeCollectionId);
      if (active) void startForegroundShuffleForCollection(active);
    }
    const mb = (r.bytes / 1_048_576).toFixed(1);
    toast(r.bytes > 0 ? `✓ Cache cleared · ${mb} MB freed` : '✓ Cache already empty');
  };

  const confirmLogout = () =>
    premiumAlert({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      icon: 'log-out-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
      ],
    });

  const copyInviteCode = async () => {
    if (!profile?.invite_code) return;
    await Clipboard.setStringAsync(profile.invite_code);
    toast('Invite code copied');
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* 1.1 Header */}
        <View style={styles.header}>
          <Text style={[styles.screenTitle, { color: theme.text }]}>Settings</Text>
          {authStatus === 'authed' ? (
            <AnimatedButton
              onPress={() =>
                router.push({
                  pathname: '/(auth)/profile-setup',
                  params: { isEdit: '1' },
                })
              }
              hitSlop={8}
              style={styles.editBtn}
            >
              <Ionicons name="pencil" size={18} color={Colors.text} />
            </AnimatedButton>
          ) : null}
        </View>

        {/* 1.2 Profile */}
        <View style={styles.profileRow}>
          <View style={[styles.avatarRing, { borderColor: theme.primary, shadowColor: theme.primary }]}>
            {profile?.avatar_id ? (
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getAvatar(profile.avatar_id).color },
                ]}
              >
                <Text style={styles.avatarEmoji}>
                  {getAvatar(profile.avatar_id).emoji}
                </Text>
              </View>
            ) : (
              <View style={styles.avatar}>
                <Ionicons name="person" size={34} color={Colors.text} />
              </View>
            )}
          </View>
          <Text style={styles.username}>
            {profile?.display_name ?? (user ? 'Kawaii User' : 'Guest')}
          </Text>
          <Text style={styles.email}>
            {user?.email ?? 'Not signed in'}
          </Text>
        </View>

        {/* 1.2b Account — invite code + sign-in CTA (shown only when authed). */}
        {authStatus === 'authed' ? (
          <SettingsSection title="Couple Pairing">
            <SettingsRow
              icon="link-outline"
              label="Your invite code"
              subtitle={
                profile?.invite_code
                  ? 'Share this code with your partner. They enter it in their app to pair.'
                  : 'Generating…'
              }
              right={<RowValue text={profile?.invite_code ?? '—'} />}
              onPress={profile?.invite_code ? copyInviteCode : undefined}
              divider={false}
            />
          </SettingsSection>
        ) : null}

        {/* 1.2c My Library — quick jump to the user's hearted wallpapers
            in a photos-page-style grid. Added as the primary content CTA
            so the user can see what they've saved without digging through
            the wallpaper preview heart icon trail. */}
        <SettingsSection title="My Library">
          <SettingsRow
            icon="heart"
            label="My Favorites"
            subtitle={
              favIds.length === 0
                ? 'Heart a wallpaper to save it here'
                : `${favIds.length} wallpaper${favIds.length === 1 ? '' : 's'} · view as photos`
            }
            right={<RowValue chevron="forward" />}
            onPress={() => router.push('/favorites' as Href)}
            divider={false}
          />
        </SettingsSection>

        {/* 1.2d Background Access — one-tap deep-links to the OEM battery /
            autostart settings so the always-on features (shuffle / mood /
            friend / sleep-wake) keep running when the app is closed. The
            single most important setup step on Vivo / MIUI / ColorOS etc.
            Android-only — iOS can't change wallpaper in the background. */}
        {Platform.OS === 'android' && (
          <SettingsSection title="Background Access">
            <SettingsRow
              icon="battery-charging"
              label="Allow always-on"
              subtitle="Stop your phone from killing the app, so wallpapers change on time"
              right={<RowValue chevron="forward" />}
              onPress={() => {
                void openBatteryOptimization();
              }}
            />
            <SettingsRow
              icon="rocket"
              label="Autostart"
              subtitle="Let the app restart itself (Vivo / MIUI / ColorOS / Oppo …)"
              right={<RowValue chevron="forward" />}
              onPress={() => {
                void openAutostartSettings();
              }}
              divider={false}
            />
          </SettingsSection>
        )}

        {/* 1.3 Premium Themes */}
        <SettingsSection title="Premium Themes">
          <SettingsRow
            label="Select Theme"
            subtitle="Applied across the whole app"
            right={<RowValue text={theme_} />}
            onPress={() => themeModal.current?.present()}
            divider={false}
          />
        </SettingsSection>

        {/* 1.4 Account Settings */}
        <SettingsSection title="Account Settings">
          <SettingsRow
            label="Auto Download"
            right={
              <Toggle
                value={autoDownload}
                onValueChange={(v) => setSetting('autoDownload', v)}
              />
            }
          />
          <SettingsRow
            label="Save to Gallery"
            subtitle="Always save"
            right={
              <Toggle
                value={saveToGallery}
                onValueChange={(v) => setSetting('saveToGallery', v)}
              />
            }
          />
          <SettingsRow
            label="Clear Cache"
            subtitle="Frees downloaded preview images"
            right={<RowValue />}
            onPress={onClearCache}
            divider={false}
          />
        </SettingsSection>

        {/* 1.4 Wallpaper Settings */}
        <SettingsSection title="Wallpaper Settings">
          <SettingsRow
            label="Default Wallpaper Resolution"
            right={<RowValue text={resolution} chevron="down" />}
            onPress={() => resolutionModal.current?.present()}
          />
          <SettingsRow
            label="Live Wallpaper Support"
            right={
              <Toggle
                value={liveWallpaper}
                onValueChange={(v) => setSetting('liveWallpaper', v)}
              />
            }
          />
          <SettingsRow
            label="Show 'Set Wallpaper' Button"
            right={
              <Toggle
                value={showSetButton}
                onValueChange={(v) => setSetting('showSetButton', v)}
              />
            }
            divider={false}
          />
        </SettingsSection>

        {/* 1.5 Wallpaper Management */}
        <SettingsSection title="Wallpaper Management">
          <SettingsRow
            label="Featured Folder"
            subtitle={'Save to a dedicated "Kawaii Baby" album'}
            right={
              <Toggle
                value={featuredFolder}
                onValueChange={(v) => setSetting('featuredFolder', v)}
              />
            }
          />
          <SettingsRow
            icon="shuffle"
            label="Auto Shuffle"
            subtitle="Rotate wallpapers on a timer"
            right={<RowValue />}
            onPress={() => router.push('/wallpapers/theme-packs')}
            divider={false}
          />
        </SettingsSection>

        {/* 1.6 AI Generator Settings */}
        <SettingsSection title="AI Generator Settings">
          <SettingsRow
            label={`${aiProvider.displayName} token`}
            right={
              <RowValue
                text={tokenStatus}
                chevron="forward"
              />
            }
            onPress={() => {
              setTokenDraft(isPoll ? pollToken : hfToken);
              aiTokenSheet.current?.present();
            }}
          />
          <SettingsRow
            label="Generate Quality"
            right={<RowValue text={generateQuality} chevron="down" />}
            onPress={() => qualityModal.current?.present()}
          />
          <SettingsRow
            label="Save Generated Images Automatically"
            right={
              <Toggle
                value={autoSaveGenerated}
                onValueChange={(v) => setSetting('autoSaveGenerated', v)}
              />
            }
          />
          <SettingsRow
            label="Daily Generation Limit"
            subtitle="Free: 3 images/day. Paste your own API key in the token row above for unlimited generation."
            divider={false}
          />
        </SettingsSection>

        {/* 1.6 Notification Settings */}
        <SettingsSection title="Notification Settings">
          <SettingsRow
            label="New Wallpaper Alerts"
            right={
              <Toggle
                value={newWallpaperAlerts}
                onValueChange={(v) => setSetting('newWallpaperAlerts', v)}
              />
            }
          />
          <SettingsRow
            label="Daily Recommendation"
            subtitle="9:00 AM"
            right={
              <Toggle
                value={dailyRecommendation}
                onValueChange={(v) => setSetting('dailyRecommendation', v)}
              />
            }
          />
          <SettingsRow
            label="Vibration on Download"
            right={
              <Toggle
                value={vibrationOnDownload}
                onValueChange={(v) => setSetting('vibrationOnDownload', v)}
              />
            }
            divider={false}
          />
        </SettingsSection>

        {/* 1.7 Privacy & Legal */}
        <SettingsSection title="Privacy & Legal">
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            right={<RowValue chevron="external" />}
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            right={<RowValue chevron="external" />}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <SettingsRow
            icon="download-outline"
            label="Export Data"
            right={<RowValue />}
            onPress={exportData}
          />
          <SettingsRow
            icon="trash-outline"
            label="Delete Account"
            danger
            onPress={confirmDelete}
            divider={false}
          />
        </SettingsSection>

        {/* 1.8 About */}
        <SettingsSection title="About">
          <SettingsRow label="App Version" right={<Text style={styles.version}>v{version}</Text>} />
          <SettingsRow
            icon="star-outline"
            label="Rate Us"
            right={<RowValue />}
            onPress={() => Linking.openURL(STORE_URL)}
          />
          <SettingsRow
            icon="share-social-outline"
            label="Share App"
            right={<RowValue />}
            onPress={() =>
              Share.share({ message: 'Check out Kawaii Baby Wallpapers HD!' })
            }
          />
          <SettingsRow
            icon="mail-outline"
            label="Contact Support"
            right={<RowValue />}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            divider={false}
          />
        </SettingsSection>

        {/* 1.9 Logout / Sign in */}
        {authStatus === 'authed' ? (
          <AnimatedButton onPress={confirmLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </AnimatedButton>
        ) : (
          <AnimatedButton
            onPress={() => router.push('/(auth)/login')}
            style={[styles.logoutBtn, { backgroundColor: theme.primary, borderColor: theme.primary }]}
          >
            <Text style={[styles.logoutText, { color: '#131313' }]}>Sign in</Text>
          </AnimatedButton>
        )}
      </ScrollView>

      <ThemeModal
        ref={themeModal}
        onSelect={() => themeModal.current?.dismiss()}
      />
      <PremiumModal
        ref={resolutionModal}
        title="Select Resolution"
        options={RESOLUTION_OPTIONS}
        selected={resolution}
        onSelect={(v) => {
          setSetting('resolution', v);
          resolutionModal.current?.dismiss();
        }}
      />
      <PremiumModal
        ref={qualityModal}
        title="Select Quality"
        options={QUALITY_OPTIONS}
        selected={generateQuality}
        onSelect={(v) => {
          setSetting('generateQuality', v);
          qualityModal.current?.dismiss();
        }}
      />

      <PremiumSheet
        ref={aiTokenSheet}
        snapPoints={['68%']}
        title={`${aiProvider.displayName} token`}
        subtitle={
          isPoll
            ? 'Optional. Pollinations works for free with no token — adding a free token just speeds up how often you can generate (1 image / 5 s instead of 1 / 15 s).'
            : DEFAULT_HF_TOKEN
              ? 'You can skip this — the app ships with a working token. Add your own here for higher quota / better results on your own account.'
              : 'Paste your token to enable image generation. Kept on this device, not shared.'
        }
      >
        <View style={styles.aiTokenBody}>
          <View style={styles.aiTokenStateRow}>
            <Ionicons
              name={
                isPoll
                  ? pollToken
                    ? 'person-circle'
                    : 'flash'
                  : isUsingUserHFToken()
                    ? 'person-circle'
                    : 'flash'
              }
              size={14}
              color={
                (isPoll ? !!pollToken : isUsingUserHFToken())
                  ? theme.primary
                  : Colors.cyan
              }
            />
            <Text style={styles.aiTokenStateText}>
              {isPoll
                ? pollToken
                  ? `Active: your token (${pollToken.slice(0, 3)}…${pollToken.slice(-4)})`
                  : 'Active: free anonymous tier (1 image / 15 s)'
                : isUsingUserHFToken()
                  ? `Active: your token (${hfToken.slice(0, 3)}…${hfToken.slice(-4)})`
                  : DEFAULT_HF_TOKEN
                    ? 'Active: app default'
                    : 'Active: none set'}
            </Text>
          </View>

          <TextInput
            value={tokenDraft}
            onChangeText={setTokenDraft}
            placeholder={isPoll ? 'paste token (optional)…' : 'hf_...'}
            placeholderTextColor={Colors.textMute}
            style={styles.aiTokenInput}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
            multiline
          />

          <Pressable
            onPress={async () => {
              try {
                const t = await Clipboard.getStringAsync();
                if (t) setTokenDraft(t.trim());
              } catch {
                /* ignore */
              }
            }}
            style={styles.aiTokenPaste}
          >
            <Ionicons name="clipboard-outline" size={14} color={Colors.textDim} />
            <Text style={styles.aiTokenPasteText}>Paste from clipboard</Text>
          </Pressable>

          <Text style={styles.aiTokenHint}>
            {isPoll
              ? 'Optional: get a free token at auth.pollinations.ai to generate more often. Leave blank to stay on the free anonymous tier — generation still works either way.'
              : 'Get a free token at huggingface.co → Settings → Access Tokens → Create with role "Read". Tap Clear below to revert to the app default.'}
          </Text>

          <View style={styles.aiTokenBtnRow}>
            <AnimatedButton
              onPress={() => {
                if (isPoll) {
                  setPollToken('');
                  aiTokenSheet.current?.dismiss();
                  toast('✓ Using free anonymous tier');
                  return;
                }
                setHFToken('');
                aiTokenSheet.current?.dismiss();
                toast(
                  DEFAULT_HF_TOKEN
                    ? '✓ Reverted to app default'
                    : 'AI token cleared',
                );
              }}
              style={[styles.aiTokenBtn, styles.aiTokenBtnSecondary]}
            >
              <Text style={[styles.aiTokenBtnText, { color: Colors.textDim }]}>
                {isPoll ? 'No token' : DEFAULT_HF_TOKEN ? 'Use default' : 'Clear'}
              </Text>
            </AnimatedButton>
            <AnimatedButton
              onPress={() => {
                const clean = tokenDraft.trim();
                if (isPoll) {
                  setPollToken(clean);
                  aiTokenSheet.current?.dismiss();
                  toast(clean ? '✓ Token saved' : '✓ Using free anonymous tier');
                  return;
                }
                if (clean && !clean.startsWith('hf_')) {
                  toast('That doesn’t look like a Hugging Face token (should start hf_)');
                  return;
                }
                setHFToken(clean);
                aiTokenSheet.current?.dismiss();
                toast(clean ? '✓ Token saved' : 'AI token cleared');
              }}
              style={[
                styles.aiTokenBtn,
                { backgroundColor: theme.primary },
              ]}
            >
              <Text style={[styles.aiTokenBtnText, { color: '#131313' }]}>
                Save
              </Text>
            </AnimatedButton>
          </View>
        </View>
      </PremiumSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: { alignItems: 'center', gap: 6 },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: Colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.pink,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 44 },
  username: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  email: { color: Colors.textDim, fontSize: 14, fontWeight: '500' },
  sliderCell: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  sliderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  sliderValue: { color: Colors.pink, fontSize: 14, fontWeight: '800' },
  version: { color: Colors.textDim, fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    borderWidth: 1,
    borderColor: Colors.pink,
    borderRadius: Radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  logoutText: { color: Colors.pink, fontSize: 15, fontWeight: '800' },

  // ─── AI token sheet ────────────────────────────────────────────────
  aiTokenBody: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  aiTokenStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiTokenStateText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  aiTokenInput: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 80,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    textAlignVertical: 'top',
  },
  aiTokenPaste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  aiTokenPasteText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  aiTokenHint: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  aiTokenBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  aiTokenBtn: {
    flex: 1,
    height: 46,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTokenBtnSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aiTokenBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
});
