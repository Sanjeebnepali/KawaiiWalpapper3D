import type { SettingsState } from '../../store/settings';
import { RowValue, SettingsRow, SettingsSection, Toggle } from '../SettingsControls';

type SetSetting = <K extends keyof SettingsState>(
  key: K,
  value: SettingsState[K],
) => void;

/**
 * The toggle/dropdown-driven preference sections of the Settings screen:
 * Premium Themes, Account Settings, Wallpaper Settings, Wallpaper
 * Management, AI Generator Settings, Notification Settings.
 *
 * Purely presentational — every value and every handler (modal-present
 * callbacks, cache clear, auto-shuffle, token row) is passed in from the
 * screen so no Zustand hook or ref lives here.
 */
export function PreferenceSections({
  themeName,
  autoDownload,
  saveToGallery,
  resolution,
  liveWallpaper,
  showSetButton,
  featuredFolder,
  generateQuality,
  autoSaveGenerated,
  newWallpaperAlerts,
  dailyRecommendation,
  vibrationOnDownload,
  setSetting,
  aiProviderName,
  tokenStatus,
  onSelectTheme,
  onClearCache,
  onSelectResolution,
  onAutoShuffle,
  onSelectProvider,
  onTokenRow,
  onSelectQuality,
}: {
  themeName: string;
  autoDownload: boolean;
  saveToGallery: boolean;
  resolution: string;
  liveWallpaper: boolean;
  showSetButton: boolean;
  featuredFolder: boolean;
  generateQuality: string;
  autoSaveGenerated: boolean;
  newWallpaperAlerts: boolean;
  dailyRecommendation: boolean;
  vibrationOnDownload: boolean;
  setSetting: SetSetting;
  aiProviderName: string;
  tokenStatus: string;
  onSelectTheme: () => void;
  onClearCache: () => void;
  onSelectResolution: () => void;
  onAutoShuffle: () => void;
  onSelectProvider: () => void;
  onTokenRow: () => void;
  onSelectQuality: () => void;
}) {
  return (
    <>
      {/* 1.3 Premium Themes */}
      <SettingsSection title="Premium Themes">
        <SettingsRow
          label="Select Theme"
          subtitle="Applied across the whole app"
          right={<RowValue text={themeName} />}
          onPress={onSelectTheme}
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
          onPress={onSelectResolution}
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
          onPress={onAutoShuffle}
          divider={false}
        />
      </SettingsSection>

      {/* 1.6 AI Generator Settings */}
      <SettingsSection title="AI Generator Settings">
        <SettingsRow
          label="AI Provider"
          subtitle="Pollinations & Hugging Face are free; OpenAI / Gemini use your own key for unlimited"
          right={<RowValue text={aiProviderName} chevron="down" />}
          onPress={onSelectProvider}
        />
        <SettingsRow
          label={`${aiProviderName} key`}
          right={
            <RowValue
              text={tokenStatus}
              chevron="forward"
            />
          }
          onPress={onTokenRow}
        />
        <SettingsRow
          label="Generate Quality"
          right={<RowValue text={generateQuality} chevron="down" />}
          onPress={onSelectQuality}
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
    </>
  );
}
