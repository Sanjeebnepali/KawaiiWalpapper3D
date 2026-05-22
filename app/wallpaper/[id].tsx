import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { Glass, GlassAbsoluteFill } from '../../components/Glass';
import {
  SetAsWallpaperModal,
  type SetAsWallpaperModalRef,
} from '../../components/SetAsWallpaperModal';
import { WallpaperMenu, type WallpaperMenuRef } from '../../components/WallpaperMenu';
import {
  WallpaperInfoModal,
  type WallpaperInfoModalRef,
} from '../../components/WallpaperInfoModal';
import { getPhotoById } from '../../constants/mockData';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from '../../lib/toast';
import { setAsWallpaper } from '../../lib/wallpaperActions';
import { useIsFavorite, useToggleFavorite } from '../../store/favorites';
import { useSettingsStore } from '../../store/settings';

export default function WallpaperPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  // May be undefined for a stale/unknown id (e.g. a favorite from an older
  // catalog). We no longer fall back to featured[0] — that silently showed an
  // unrelated wallpaper (CORE-7). Render an explicit "unavailable" state
  // below instead.
  const item = getPhotoById(id ?? '');

  const [loaded, setLoaded] = useState(false);
  const [applying, setApplying] = useState(false);
  // Guard async setState callers (Image.onLoad, async apply handler) so a
  // fast back-navigation during image fetch doesn't try to update an
  // unmounted component — that's the source of the "hasn't mounted yet"
  // warning the user was seeing.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  // Defer mounting the 3 bottom-sheet modals (WallpaperMenu has 10 staggered
  // FadeInUp rows; SetAsWallpaperModal + WallpaperInfoModal add ~6 more) until
  // AFTER the navigation animation completes. Without this, those ~30
  // worklet animations queue on the JS thread during route push and the
  // screen "freezes" for ~1 s on a mid-range Android. Once mounted, the
  // sheets stay mounted — subsequent presents are cheap.
  const [sheetsReady, setSheetsReady] = useState(false);
  const pendingPresentRef = useRef<null | (() => void)>(null);

  // Hooks must run unconditionally and in a stable order, so they're called
  // before the `item == null` early-return below. `item?.id ?? ''` keeps the
  // favorite selector keyed to a harmless empty id when the asset is missing.
  const isFav = useIsFavorite(item?.id ?? '');
  const toggleFav = useToggleFavorite();
  // Settings → "Show 'Set Wallpaper' Button" gates the prominent Apply CTA
  // at the bottom of the preview. When OFF the user still has the same
  // action available from the bottom-sheet menu (… → Set as Wallpaper)
  // — this toggle is for users who prefer a cleaner preview canvas.
  const showSetButton = useSettingsStore((s) => s.showSetButton);
  const menuRef = useRef<WallpaperMenuRef>(null);
  const setWallpaperRef = useRef<SetAsWallpaperModalRef>(null);
  const infoRef = useRef<WallpaperInfoModalRef>(null);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setSheetsReady(true);
    });
    return () => task.cancel();
  }, []);

  // If the user taps a button that needs a sheet BEFORE the deferred mount
  // fires (unlikely but possible on slow devices), force the mount now and
  // remember which present() to call when it lands.
  useEffect(() => {
    if (sheetsReady && pendingPresentRef.current) {
      const fn = pendingPresentRef.current;
      pendingPresentRef.current = null;
      // Wait one microtask so the ref is wired up.
      queueMicrotask(fn);
    }
  }, [sheetsReady]);

  const presentOrQueue = (fn: () => void) => {
    if (sheetsReady) {
      fn();
    } else {
      pendingPresentRef.current = fn;
      setSheetsReady(true);
    }
  };

  const onToggleFav = () => {
    if (!item) return;
    const willBeFav = !isFav;
    toggleFav(item.id);
    toast(willBeFav ? '✓ Added to favorites' : 'Removed from favorites');
  };

  // gorhom v5 BottomSheetModalProvider stacks modals — dismiss + present in
  // the same tick keeps the backdrop active and is visually smooth. No
  // setTimeout needed (the old 220ms wait was pure dead time on tap).
  const openMenu = () => presentOrQueue(() => menuRef.current?.present());
  const openSetWallpaperModal = () =>
    presentOrQueue(() => {
      menuRef.current?.dismiss();
      setWallpaperRef.current?.present();
    });
  const openInfo = () =>
    presentOrQueue(() => {
      menuRef.current?.dismiss();
      infoRef.current?.present();
    });

  // One-tap Apply: skip the Lock/Home/Both modal and apply to BOTH screens.
  // Long-press Apply still opens the modal if the user wants a target choice
  // (changes/017).
  const onApplyTap = async () => {
    if (applying || !item) return;
    setApplying(true);
    const r = await setAsWallpaper(item.image, item.id, 'both');
    if (mountedRef.current) setApplying(false);
    toast(r.message);
  };

  // Unavailable state (CORE-7) — the id didn't resolve to a real catalog /
  // featured asset (stale favorite, removed wallpaper). Show an explicit
  // missing-asset screen with a way back rather than a random fallback image.
  if (!item) {
    return (
      <View style={[styles.root, styles.unavailableRoot]}>
        <SafeAreaView style={styles.unavailable} edges={['top', 'bottom']}>
          <View style={styles.unavailableGlyph}>
            <Ionicons name="image-outline" size={32} color={theme.primary} />
          </View>
          <Text style={styles.unavailableTitle}>Wallpaper unavailable</Text>
          <Text style={styles.unavailableSub}>
            This wallpaper isn’t available anymore. It may have been removed
            from the catalog.
          </Text>
          <AnimatedButton
            onPress={() => router.back()}
            style={[styles.unavailableBtn, { backgroundColor: theme.primary }]}
          >
            <Ionicons name="chevron-back" size={16} color="#131313" />
            <Text style={styles.unavailableBtnText}>Go back</Text>
          </AnimatedButton>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Image
        source={{ uri: item.image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // No transition — the BlurView overlay covers everything until onLoad
        // fires, so a fade-in on the underlying image is invisible work.
        transition={0}
        onLoad={() => {
          if (mountedRef.current) setLoaded(true);
        }}
      />

      {!loaded && (
        <GlassAbsoluteFill intensity={80} tint="dark" androidFill="rgba(10,10,10,0.55)">
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={theme.primary} size="large" />
            <Text style={styles.loaderText}>Loading HD preview…</Text>
          </View>
        </GlassAbsoluteFill>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.65)', 'transparent', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.chrome} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <AnimatedButton onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </AnimatedButton>
          <View style={[styles.tag, { borderColor: item.accent }]}>
            <View style={[styles.tagDot, { backgroundColor: item.accent }]} />
            <Text style={[styles.tagText, { color: item.accent }]}>{item.tag}</Text>
          </View>
          <AnimatedButton
            style={styles.iconBtn}
            hitSlop={10}
            onPress={openMenu}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
          </AnimatedButton>
        </View>

        <View style={styles.footer}>
          <Glass intensity={50} tint="dark" style={styles.glass}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>HD · 9:16 · AI generated</Text>
            </View>
            <AnimatedButton
              style={[
                styles.heart,
                isFav && {
                  borderColor: theme.primary,
                  shadowColor: theme.primary,
                  shadowOpacity: 0.6,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 0 },
                },
              ]}
              onPress={onToggleFav}
              hitSlop={6}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={20}
                color={isFav ? theme.primary : Colors.text}
              />
            </AnimatedButton>
            {showSetButton ? (
              <AnimatedButton
                onPress={onApplyTap}
                onLongPress={openSetWallpaperModal}
                delayLongPress={260}
                disabled={applying}
                style={[
                  styles.apply,
                  { shadowColor: item.accent, backgroundColor: item.accent },
                  applying && { opacity: 0.7 },
                ]}
              >
                {applying ? (
                  <ActivityIndicator color="#131313" size="small" />
                ) : (
                  <Ionicons name="checkmark-circle" size={16} color="#131313" />
                )}
                <Text style={styles.applyText}>{applying ? 'Applying…' : 'Apply'}</Text>
              </AnimatedButton>
            ) : null}
          </Glass>
        </View>
      </SafeAreaView>

      {sheetsReady && (
        <>
          <WallpaperMenu
            ref={menuRef}
            item={item}
            onSetWallpaper={openSetWallpaperModal}
            onShowInfo={openInfo}
          />
          <SetAsWallpaperModal ref={setWallpaperRef} item={item} />
          <WallpaperInfoModal ref={infoRef} item={item} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  unavailableRoot: { backgroundColor: Colors.bg },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  unavailableGlyph: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  unavailableTitle: {
    color: Colors.text, fontSize: 20, fontWeight: '800',
    letterSpacing: -0.3, textAlign: 'center',
  },
  unavailableSub: {
    color: Colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center',
  },
  unavailableBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: Radius.pill, marginTop: Spacing.sm,
  },
  unavailableBtnText: { color: '#131313', fontSize: 14, fontWeight: '800' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loaderText: { color: Colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  chrome: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderColor: Colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.pill, borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  footer: { paddingBottom: Spacing.md },
  glass: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.glassStroke,
    backgroundColor: Colors.glassFill,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  meta: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  heart: {
    width: 40, height: 40, borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  apply: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.pill,
    shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  applyText: { color: '#131313', fontSize: 13, fontWeight: '800' },
});
