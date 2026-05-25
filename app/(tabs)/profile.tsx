import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { PremiumModal } from '../../components/PremiumModal';
import { PremiumSheet } from '../../components/PremiumSheet';
import { AiTokenSheetBody } from '../../components/settings/AiTokenSheetBody';
import { LibraryAccessSections } from '../../components/settings/LibraryAccessSections';
import { PreferenceSections } from '../../components/settings/PreferenceSections';
import { PrivacyAboutSections } from '../../components/settings/PrivacyAboutSections';
import { ProfileHeader } from '../../components/settings/ProfileHeader';
import { styles } from '../../components/settings/styles';
import {
  RowValue,
  SettingsRow,
  SettingsSection,
} from '../../components/SettingsControls';
import { ThemeModal } from '../../components/ThemeModal';
import { useTheme } from '../../contexts/ThemeContext';
import { getProvider, PROVIDERS } from '../../lib/ai/registry';
import { AI_TOKEN_CFG } from '../../lib/ai/tokens';
import {
  makeClearCache,
  makeConfirmDelete,
  makeConfirmLogout,
  makeExportData,
} from '../../lib/settingsActions';
import {
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
} from '../../lib/settingsConstants';
import { useAIStore } from '../../store/ai';
import { useAuthStore } from '../../store/auth';
import { useFavoritesStore } from '../../store/favorites';
import { useSettingsStore } from '../../store/settings';

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

  // Entitlements — drive the Subscription row's status label (changes/158).
  const allAccess = useSettingsStore((st) => st.allAccess);
  const entThemePacks = useSettingsStore((st) => st.entThemePacks);
  const entMood = useSettingsStore((st) => st.entMood);
  const entCollection = useSettingsStore((st) => st.entCollection);
  const isCouplePremium = useSettingsStore((st) => st.isCouplePremium);

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
  const providerModal = useRef<BottomSheetModal>(null);

  // AI provider + per-provider API key. Each provider has its own token
  // field in the AI store; the picker switches the active provider and the
  // single key row/sheet below adapts to it (see lib/ai/tokens.ts).
  const hfToken = useAIStore((s) => s.hfToken);
  const pollToken = useAIStore((s) => s.pollToken);
  const openaiToken = useAIStore((s) => s.openaiToken);
  const geminiToken = useAIStore((s) => s.geminiToken);
  const providerId = useAIStore((s) => s.providerId);
  const setProviderId = useAIStore((s) => s.setProviderId);
  const aiProvider = getProvider(providerId);
  const [tokenDraft, setTokenDraft] = useState('');

  // The single token row + sheet adapts to whichever provider is active.
  // `activeToken` is that provider's user-pasted key (empty = none/default);
  // `tokenCfg` carries the provider-specific copy/placeholder (lib/ai/tokens).
  const activeToken =
    providerId === 'huggingface'
      ? hfToken
      : providerId === 'dalle'
        ? openaiToken
        : providerId === 'gemini'
          ? geminiToken
          : pollToken;
  const tokenCfg = AI_TOKEN_CFG[providerId] ?? AI_TOKEN_CFG.pollinations;
  const maskToken = (t: string) => `${t.slice(0, 3)}…${t.slice(-4)}`;
  const tokenStatus = activeToken ? maskToken(activeToken) : tokenCfg.emptyStatus;

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const exportData = makeExportData(favIds);
  const confirmDelete = makeConfirmDelete(clearFavorites, signOut);
  const onClearCache = makeClearCache();
  const confirmLogout = makeConfirmLogout(signOut);

  // Subscription status shown on the Manage Subscription row.
  const ownedCount = [
    entThemePacks,
    entMood,
    entCollection,
    isCouplePremium,
  ].filter(Boolean).length;
  const subStatus = allAccess
    ? 'All Access'
    : ownedCount > 0
      ? `${ownedCount} of 4 unlocked`
      : 'Free';

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader
          theme={theme}
          authStatus={authStatus}
          profile={profile}
          user={user}
          onEditPress={() =>
            router.push({
              pathname: '/(auth)/profile-setup',
              params: { isEdit: '1' },
            })
          }
        />

        {/* Subscription — the single payment entry point (changes/158). Opens
            the subscription page where the four premium areas + All Access are
            bought à la carte. Replaces the old "Couple Pairing" invite-code
            section (couple pairing now lives entirely on the Couple tab). */}
        <SettingsSection title="Subscription">
          <SettingsRow
            icon="diamond"
            iconColor={theme.primary}
            label="Manage Subscription"
            subtitle="Unlock theme packs, mood, premium & couple"
            right={<RowValue text={subStatus} />}
            onPress={() => router.push('/subscription' as Href)}
            divider={false}
          />
        </SettingsSection>

        <LibraryAccessSections
          favCount={favIds.length}
          onOpenFavorites={() => router.push('/favorites' as Href)}
        />

        <PreferenceSections
          themeName={theme_}
          autoDownload={autoDownload}
          saveToGallery={saveToGallery}
          resolution={resolution}
          liveWallpaper={liveWallpaper}
          showSetButton={showSetButton}
          featuredFolder={featuredFolder}
          generateQuality={generateQuality}
          autoSaveGenerated={autoSaveGenerated}
          newWallpaperAlerts={newWallpaperAlerts}
          dailyRecommendation={dailyRecommendation}
          vibrationOnDownload={vibrationOnDownload}
          setSetting={setSetting}
          aiProviderName={aiProvider.displayName}
          tokenStatus={tokenStatus}
          onSelectTheme={() => themeModal.current?.present()}
          onClearCache={onClearCache}
          onSelectResolution={() => resolutionModal.current?.present()}
          onAutoShuffle={() => router.push('/wallpapers/theme-packs')}
          onSelectProvider={() => providerModal.current?.present()}
          onTokenRow={() => {
            setTokenDraft(activeToken);
            aiTokenSheet.current?.present();
          }}
          onSelectQuality={() => qualityModal.current?.present()}
        />

        <PrivacyAboutSections
          version={version}
          onExportData={exportData}
          onDeleteAccount={confirmDelete}
        />

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

      <PremiumModal
        ref={providerModal}
        title="AI Provider"
        options={PROVIDERS.map((p) => p.displayName)}
        selected={aiProvider.displayName}
        onSelect={(name) => {
          const p = PROVIDERS.find((x) => x.displayName === name);
          if (p) setProviderId(p.id);
          providerModal.current?.dismiss();
        }}
      />

      <PremiumSheet
        ref={aiTokenSheet}
        snapPoints={['68%']}
        title={`${aiProvider.displayName} key`}
        subtitle={tokenCfg.subtitle}
      >
        <AiTokenSheetBody
          theme={theme}
          providerId={providerId}
          providerDisplayName={aiProvider.displayName}
          tokenCfg={tokenCfg}
          activeToken={activeToken}
          maskToken={maskToken}
          tokenDraft={tokenDraft}
          setTokenDraft={setTokenDraft}
          onDismiss={() => aiTokenSheet.current?.dismiss()}
        />
      </PremiumSheet>
    </SafeAreaView>
  );
}
