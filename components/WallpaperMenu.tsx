import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { Linking, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from '../lib/toast';
import {
  copyLink,
  saveToGallery,
  setAsWallpaper,
  shareWallpaper,
  type WallpaperTarget,
} from '../lib/wallpaperActions';
import { useIsFavorite, useToggleFavorite } from '../store/favorites';
import { useSettingsStore } from '../store/settings';
import { AnimatedButton } from './AnimatedButton';
import { premiumAlert } from './PremiumAlert';
import { PremiumSheet } from './PremiumSheet';

export type WallpaperMenuRef = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  item: {
    id: string;
    image: string;
    title: string;
    tag: string;
    accent: string;
  };
  /**
   * Called when the user taps "Set as Wallpaper". If provided, the menu
   * dismisses and lets the parent present a richer modal
   * (`SetAsWallpaperModal`); otherwise falls back to a Lock/Home/Both Alert.
   */
  onSetWallpaper?: () => void;
  /** Called when the user taps "Wallpaper Info". Falls back to an Alert. */
  onShowInfo?: () => void;
};

const STORE_URL = 'https://example.com/kawaii/store';

type Option = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint?: string;
  danger?: boolean;
  onPress: () => void;
};

/**
 * Bottom-sheet action menu for the wallpaper preview (Features 1 + 6, now
 * polished). Built on the shared `PremiumSheet` wrapper so the gradient
 * accent strip + themed surface stay consistent across all sheets. Each row
 * is an `AnimatedButton` (press-scale) with a staggered `FadeInUp` entrance.
 *
 * The "Set as Wallpaper" and "Wallpaper Info" actions can be delegated to
 * the parent via `onSetWallpaper` / `onShowInfo` so they open the dedicated
 * premium modals; if those props are omitted, the menu still works
 * standalone via fallback Alerts.
 */
export const WallpaperMenu = forwardRef<WallpaperMenuRef, Props>(
  ({ item, onSetWallpaper, onShowInfo }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => sheetRef.current?.present(),
        dismiss: () => sheetRef.current?.dismiss(),
      }),
      [],
    );

    const dismiss = () => sheetRef.current?.dismiss();

    const isFav = useIsFavorite(item.id);
    const toggleFav = useToggleFavorite();
    const useFeaturedFolder = useSettingsStore((s) => s.featuredFolder);

    const handleSave = async () => {
      dismiss();
      const r = await saveToGallery(item.image, item.id, useFeaturedFolder);
      toast(r.message);
    };

    const handleShare = async () => {
      dismiss();
      const r = await shareWallpaper(item.image, item.id);
      toast(r.message);
    };

    const handleEdit = () => {
      dismiss();
      toast('✏️ Image editor is coming in a future update');
    };

    const handleFavorite = () => {
      const willBeFav = !isFav;
      toggleFav(item.id);
      toast(willBeFav ? '✓ Added to favorites' : 'Removed from favorites');
      dismiss();
    };

    const handleSetWallpaper = () => {
      if (onSetWallpaper) {
        onSetWallpaper();
        return;
      }
      // Standalone fallback (component used without a parent-owned modal).
      dismiss();
      const runSet = async (target: WallpaperTarget) => {
        const r = await setAsWallpaper(item.image, item.id, target);
        toast(r.message);
      };
      premiumAlert({
        title: 'Set as Wallpaper',
        message: `Where would you like to apply "${item.title}"?`,
        icon: 'image-outline',
        buttons: [
          { text: 'Lock Screen', onPress: () => runSet('lock') },
          { text: 'Home Screen', onPress: () => runSet('home') },
          { text: 'Both Screens', onPress: () => runSet('both') },
          { text: 'Cancel', style: 'cancel' },
        ],
      });
    };

    const handleFeaturedFolder = async () => {
      dismiss();
      const r = await saveToGallery(item.image, item.id, true);
      toast(r.message);
    };

    const handleCopyLink = async () => {
      dismiss();
      const r = await copyLink(item.image);
      toast(r.message);
    };

    const handleInfo = () => {
      if (onShowInfo) {
        onShowInfo();
        return;
      }
      dismiss();
      premiumAlert({
        title: item.title,
        message: `Tag: ${item.tag}\nResolution: 720 × 1280\nFormat: JPG\nSource: AI generated\nID: ${item.id}`,
        icon: 'information-circle-outline',
      });
    };

    const handleRate = () => {
      dismiss();
      Linking.openURL(STORE_URL).catch(() => toast('Failed to open store'));
    };

    const handleReport = () => {
      dismiss();
      premiumAlert({
        title: 'Report Wallpaper',
        message: 'Mark this wallpaper as inappropriate?',
        icon: 'flag-outline',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report',
            style: 'destructive',
            onPress: () => toast('✓ Report submitted — thank you'),
          },
        ],
      });
    };

    const options: Option[] = [
      { key: 'save', icon: 'download-outline', label: 'Save to Gallery', onPress: handleSave },
      { key: 'share', icon: 'share-social-outline', label: 'Share with Friends', onPress: handleShare },
      { key: 'edit', icon: 'create-outline', label: 'Edit Image', onPress: handleEdit },
      {
        key: 'fav',
        icon: isFav ? 'heart' : 'heart-outline',
        label: isFav ? 'Remove from Favorites' : 'Add to Favorites',
        tint: isFav ? theme.primary : undefined,
        onPress: handleFavorite,
      },
      { key: 'set', icon: 'phone-portrait-outline', label: 'Set as Wallpaper', onPress: handleSetWallpaper },
      { key: 'featured', icon: 'folder-open-outline', label: 'Save to Featured Folder', onPress: handleFeaturedFolder },
      { key: 'copy', icon: 'link-outline', label: 'Copy Link', onPress: handleCopyLink },
      { key: 'info', icon: 'information-circle-outline', label: 'Wallpaper Info', onPress: handleInfo },
      { key: 'rate', icon: 'star-outline', label: 'Rate This', onPress: handleRate },
      { key: 'report', icon: 'flag-outline', label: 'Report', danger: true, onPress: handleReport },
    ];

    return (
      <PremiumSheet
        ref={sheetRef}
        snapPoints={['82%']}
        title={item.title}
        subtitle="Choose an action"
        accentColor={item.accent}
      >
        {options.map((opt, i) => {
          const tint = opt.danger ? Colors.error : opt.tint ?? theme.text;
          return (
            <Animated.View
              key={opt.key}
              entering={FadeInUp.delay(40 + i * 28).springify().damping(16)}
            >
              <AnimatedButton onPress={opt.onPress} style={styles.row}>
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={tint}
                  style={styles.rowIcon}
                />
                <Text style={[styles.label, { color: tint }]}>{opt.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.textMute}
                />
              </AnimatedButton>
            </Animated.View>
          );
        })}

        <AnimatedButton onPress={dismiss} style={styles.cancel} hitSlop={6}>
          <Text style={[styles.cancelText, { color: theme.textDim }]}>Cancel</Text>
        </AnimatedButton>
      </PremiumSheet>
    );
  },
);

WallpaperMenu.displayName = 'WallpaperMenu';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
    gap: Spacing.md,
    marginBottom: 6,
  },
  rowIcon: { width: 22, textAlign: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 14, marginTop: Spacing.sm },
  cancelText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
});
