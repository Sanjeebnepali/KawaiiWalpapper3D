import { Platform } from 'react-native';
import {
  openAutostartSettings,
  openBatteryOptimization,
} from '../../lib/backgroundAccess';
import { RowValue, SettingsRow, SettingsSection } from '../SettingsControls';

/**
 * "My Library" + "Background Access" sections.
 *
 * My Library is a quick jump to the user's hearted wallpapers; it needs the
 * favorite count + the navigation callback (which touches the router) from the
 * screen. Background Access is Android-only and self-contained — it deep-links
 * to the OEM battery / autostart settings itself via lib/backgroundAccess.
 */
export function LibraryAccessSections({
  favCount,
  onOpenFavorites,
}: {
  favCount: number;
  onOpenFavorites: () => void;
}) {
  return (
    <>
      {/* 1.2c My Library — quick jump to the user's hearted wallpapers
          in a photos-page-style grid. Added as the primary content CTA
          so the user can see what they've saved without digging through
          the wallpaper preview heart icon trail. */}
      <SettingsSection title="My Library">
        <SettingsRow
          icon="heart"
          label="My Favorites"
          subtitle={
            favCount === 0
              ? 'Heart a wallpaper to save it here'
              : `${favCount} wallpaper${favCount === 1 ? '' : 's'} · view as photos`
          }
          right={<RowValue chevron="forward" />}
          onPress={onOpenFavorites}
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
    </>
  );
}
