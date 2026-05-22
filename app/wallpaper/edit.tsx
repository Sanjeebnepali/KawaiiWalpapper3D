import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from '../../lib/toast';
import {
  downloadToCache,
  saveToGallery,
  setAsWallpaper,
} from '../../lib/wallpaperActions';
import { useSettingsStore } from '../../store/settings';

type Img = { uri: string; width: number; height: number };
type Actions = Parameters<typeof ImageManipulator.manipulateAsync>[1];

/**
 * Image editor — reached from the wallpaper menu's "Edit Image" action.
 * Non-destructive transforms via expo-image-manipulator (already linked for
 * the mood detector, so no native rebuild): rotate, flip, crop-to-phone.
 * Each tap applies to the working copy and updates the preview; Reset goes
 * back to the original. Output saves to the gallery or applies as wallpaper.
 */
export default function WallpaperEdit() {
  const { uri, id } = useLocalSearchParams<{ uri: string; id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const featuredFolder = useSettingsStore((s) => s.featuredFolder);

  const [orig, setOrig] = useState<Img | null>(null);
  const [cur, setCur] = useState<Img | null>(null);
  const [busy, setBusy] = useState(true);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Manipulator needs a LOCAL uri; the source is usually a remote URL, so
  // download to cache first. A no-op manipulate then yields the dimensions
  // we need to compute a centered crop.
  useEffect(() => {
    (async () => {
      try {
        const local = await downloadToCache(uri ?? '', id ?? 'edit');
        const res = await ImageManipulator.manipulateAsync(local, [], {});
        if (!mounted.current) return;
        const img = { uri: res.uri, width: res.width, height: res.height };
        setOrig(img);
        setCur(img);
      } catch {
        toast('Could not load this image for editing');
        router.back();
      } finally {
        if (mounted.current) setBusy(false);
      }
    })();
  }, [uri, id, router]);

  const run = async (actions: Actions) => {
    if (!cur || busy) return;
    setBusy(true);
    try {
      const res = await ImageManipulator.manipulateAsync(cur.uri, actions, {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (mounted.current) {
        setCur({ uri: res.uri, width: res.width, height: res.height });
      }
    } catch {
      toast('Edit failed — please try again');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // Centered 9:16 crop so the result fits a phone screen edge-to-edge.
  const cropPhone = () => {
    if (!cur) return;
    const ratio = 9 / 16;
    const { width: w, height: h } = cur;
    if (w / h > ratio) {
      const nw = Math.round(h * ratio);
      run([{ crop: { originX: Math.round((w - nw) / 2), originY: 0, width: nw, height: h } }]);
    } else {
      const nh = Math.round(w / ratio);
      run([{ crop: { originX: 0, originY: Math.round((h - nh) / 2), width: w, height: nh } }]);
    }
  };

  const dirty = !!orig && !!cur && cur.uri !== orig.uri;
  const reset = () => { if (orig) setCur(orig); };

  const onSave = async () => {
    if (!cur || busy) return;
    setBusy(true);
    const r = await saveToGallery(cur.uri, `${id ?? 'edit'}-edited`, featuredFolder);
    if (mounted.current) setBusy(false);
    toast(r.message);
  };

  const onApply = async () => {
    if (!cur || busy) return;
    setBusy(true);
    const r = await setAsWallpaper(cur.uri, `${id ?? 'edit'}-edited`, 'both');
    if (mounted.current) setBusy(false);
    toast(r.message);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>Edit Image</Text>
        <AnimatedButton onPress={reset} style={styles.iconBtn} hitSlop={8} disabled={!dirty}>
          <Ionicons name="refresh" size={18} color={dirty ? theme.text : Colors.textMute} />
        </AnimatedButton>
      </View>

      <View style={styles.canvas}>
        {cur ? (
          <Image
            source={{ uri: cur.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={120}
          />
        ) : null}
        {busy ? (
          <View style={styles.busyWrap} pointerEvents="none">
            <ActivityIndicator color={theme.primary} size="large" />
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tools}
      >
        <Tool icon="return-up-back" label="Rotate L" onPress={() => run([{ rotate: -90 }])} disabled={busy} />
        <Tool icon="return-up-forward" label="Rotate R" onPress={() => run([{ rotate: 90 }])} disabled={busy} />
        <Tool icon="swap-horizontal" label="Flip H" onPress={() => run([{ flip: ImageManipulator.FlipType.Horizontal }])} disabled={busy} />
        <Tool icon="swap-vertical" label="Flip V" onPress={() => run([{ flip: ImageManipulator.FlipType.Vertical }])} disabled={busy} />
        <Tool icon="crop" label="Fit phone" onPress={cropPhone} disabled={busy} />
      </ScrollView>

      <View style={styles.actions}>
        <AnimatedButton onPress={onSave} disabled={busy} style={[styles.action, styles.outline, { borderColor: theme.primary }]}>
          <Ionicons name="download-outline" size={18} color={theme.primary} />
          <Text style={[styles.actionText, { color: theme.primary }]}>Save to Gallery</Text>
        </AnimatedButton>
        <AnimatedButton onPress={onApply} disabled={busy} style={[styles.action, { backgroundColor: theme.primary }]}>
          <Ionicons name="phone-portrait-outline" size={18} color="#131313" />
          <Text style={[styles.actionText, { color: '#131313' }]}>Set Wallpaper</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

function Tool({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <AnimatedButton onPress={onPress} disabled={disabled} style={styles.tool}>
      <Ionicons name={icon} size={22} color={theme.text} />
      <Text style={styles.toolLabel}>{label}</Text>
    </AnimatedButton>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  canvas: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  busyWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  tools: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  tool: {
    width: 76,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 5,
  },
  toolLabel: { color: Colors.textDim, fontSize: 11, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  action: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  actionText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
});
