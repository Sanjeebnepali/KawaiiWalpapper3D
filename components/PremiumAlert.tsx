import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { AnimatedButton } from './AnimatedButton';
import { PremiumSheet } from './PremiumSheet';

/**
 * Premium-styled replacement for `react-native`'s `Alert.alert`.
 *
 * The native alert popup looked dated against the rest of the app's
 * gradient + bottom-sheet aesthetic. This wraps `PremiumSheet` (the same
 * bottom-sheet primitive the wallpaper-menu, theme-picker, set-as
 * wallpaper, etc. use) with an Alert-like imperative API.
 *
 * USAGE — anywhere in the app:
 *
 *   import { premiumAlert } from '../../components/PremiumAlert';
 *
 *   premiumAlert({
 *     title: 'Camera access blocked',
 *     message: 'Open Settings to allow camera access.',
 *     icon: 'lock-closed',
 *     buttons: [
 *       { text: 'Cancel', style: 'cancel' },
 *       { text: 'Open Settings', onPress: () => Linking.openSettings() },
 *     ],
 *   });
 *
 * `PremiumAlertHost` MUST be mounted exactly once at the app root inside
 * the `BottomSheetModalProvider` — done in `app/_layout.tsx`.
 */

export type PremiumAlertButton = {
  text: string;
  /** 'cancel' = neutral grey; 'destructive' = red; 'default' = themed primary. */
  style?: 'default' | 'cancel' | 'destructive';
  /**
   * Callback fired AFTER the sheet animates closed (small delay so the
   * dismiss animation isn't interrupted by a subsequent navigation /
   * native dialog).
   */
  onPress?: () => void;
};

export type PremiumAlertOptions = {
  title: string;
  message?: string;
  /** Optional Ionicons name shown at the top above the title (e.g. 'lock-closed'). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Tint colour for the icon + accent strip. Defaults to theme.primary. */
  accentColor?: string;
  /** 1–6 actions. If omitted, a single "OK" button is shown. */
  buttons?: PremiumAlertButton[];
};

// Module-level handle to the singleton host. Set by `PremiumAlertHost`
// once mounted; read by `premiumAlert()` for imperative invocation.
let externalShow: ((opts: PremiumAlertOptions) => void) | null = null;

/**
 * Show a premium-styled alert. Returns immediately; the user's button
 * choice fires the corresponding `onPress` after the sheet closes.
 *
 * If the host isn't mounted yet (very early bootstrap), falls back to a
 * silent no-op + dev-only warning rather than throwing.
 */
export function premiumAlert(opts: PremiumAlertOptions): void {
  if (externalShow) {
    externalShow(opts);
  } else if (__DEV__) {
    console.warn('[PremiumAlert] host not mounted — alert dropped:', opts.title);
  }
}

/**
 * Snap point per button count. `PremiumSheet` runs with
 * `enableDynamicSizing={false}` so we can't auto-size — we approximate by
 * scaling the sheet height to the longest alert we're likely to show.
 * 6+ buttons (interval picker has 6 + cancel = 7) needs ~72 % to clear the
 * safe-area + show all rows without scrolling.
 */
function snapForButtonCount(n: number): string {
  if (n <= 2) return '40%';
  if (n <= 4) return '55%';
  if (n <= 6) return '70%';
  return '82%';
}

export function PremiumAlertHost() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [opts, setOpts] = useState<PremiumAlertOptions | null>(null);
  const [snap, setSnap] = useState<string[]>(['40%']);

  useEffect(() => {
    externalShow = (o) => {
      setSnap([snapForButtonCount((o.buttons ?? [{ text: 'OK' }]).length)]);
      setOpts(o);
      sheetRef.current?.present();
    };
    return () => {
      externalShow = null;
    };
  }, []);

  const handlePress = useCallback((btn: PremiumAlertButton) => {
    sheetRef.current?.dismiss();
    // Wait for the dismiss animation so any follow-up navigation isn't
    // racing the sheet's close. 220 ms matches @gorhom default close
    // duration on Android; iOS is similar.
    setTimeout(() => {
      try {
        btn.onPress?.();
      } catch (e) {
        if (__DEV__) console.warn('[PremiumAlert] button onPress threw:', e);
      }
    }, 220);
  }, []);

  return (
    <PremiumSheet
      ref={sheetRef}
      snapPoints={snap}
      title={opts?.title}
      subtitle={opts?.message}
      accentColor={opts?.accentColor}
    >
      {opts ? (
        <AlertContent
          icon={opts.icon}
          accentColor={opts.accentColor}
          buttons={opts.buttons ?? [{ text: 'OK' }]}
          onPress={handlePress}
        />
      ) : null}
    </PremiumSheet>
  );
}

function AlertContent({
  icon,
  accentColor,
  buttons,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  buttons: PremiumAlertButton[];
  onPress: (btn: PremiumAlertButton) => void;
}) {
  const theme = useTheme();
  const accent = accentColor ?? theme.primary;

  return (
    <View style={contentStyles.wrap}>
      {icon ? (
        <View
          style={[
            contentStyles.iconWrap,
            { backgroundColor: accent + '22', borderColor: accent + '55' },
          ]}
        >
          <Ionicons name={icon} size={22} color={accent} />
        </View>
      ) : null}

      <View style={contentStyles.buttons}>
        {buttons.map((btn, i) => {
          const isCancel = btn.style === 'cancel';
          const isDestructive = btn.style === 'destructive';
          const bg = isCancel
            ? Colors.surfaceHi
            : isDestructive
              ? '#3a1f1f'
              : accent;
          const fg = isCancel
            ? Colors.text
            : isDestructive
              ? '#FF8A80'
              : '#131313';
          const border = isDestructive ? '#FF8A8055' : 'transparent';
          return (
            <AnimatedButton
              key={`${btn.text}-${i}`}
              onPress={() => onPress(btn)}
              style={[
                contentStyles.btn,
                { backgroundColor: bg, borderColor: border },
              ]}
            >
              <Text style={[contentStyles.btnText, { color: fg }]}>
                {btn.text}
              </Text>
            </AnimatedButton>
          );
        })}
      </View>
    </View>
  );
}

const contentStyles = StyleSheet.create({
  wrap: { gap: Spacing.lg, alignItems: 'stretch' },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  buttons: { gap: Spacing.sm },
  btn: {
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
