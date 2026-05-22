import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Themes } from '../constants/theme';
import { useSettingsStore } from '../store/settings';
import { AnimatedButton } from './AnimatedButton';

const GAP = Spacing.sm;

type Props = {
  /** Called after a theme is chosen — lets the host modal dismiss itself. */
  onSelect?: () => void;
};

/**
 * Premium theme selector — a wrap-grid of gradient preview tiles. Tapping a
 * tile persists the theme name into the settings store (which the app-wide
 * ThemeContext reads). Tiles are flex-sized (`width: '31%'`) so the grid works
 * in any container — the Settings section card or the ThemeModal sheet.
 */
export function ThemePicker({ onSelect }: Props) {
  const active = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.set);

  return (
    <View style={styles.wrap}>
      {Themes.map((t) => {
        const selected = t.name === active || t.id === active;
        return (
          <AnimatedButton
            key={t.id}
            onPress={() => {
              setSetting('theme', t.name);
              onSelect?.();
            }}
            wrapperStyle={styles.tile}
            style={styles.tileInner}
          >
            <View
              style={[
                styles.swatch,
                selected && { borderColor: t.primary, borderWidth: 2 },
              ]}
            >
              <LinearGradient
                colors={t.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {selected && (
                <View style={[styles.check, { backgroundColor: t.primary }]}>
                  <Ionicons name="checkmark" size={13} color="#131313" />
                </View>
              )}
            </View>
            <Text
              style={[styles.name, selected && styles.nameActive]}
              numberOfLines={1}
            >
              {t.name}
            </Text>
          </AnimatedButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    paddingVertical: Spacing.sm,
  },
  tile: { width: '31%' },
  tileInner: { gap: 5 },
  swatch: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  check: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  nameActive: { color: Colors.text },
});
