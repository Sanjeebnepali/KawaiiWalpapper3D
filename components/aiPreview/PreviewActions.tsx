import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

type BusyAction = null | 'save' | 'set' | 'pool';

/**
 * Primary action: Set as Wallpaper.
 * Full-width hero CTA — the main reason the user came here.
 */
export function PrimaryAction({
  onSet,
  busyAction,
}: {
  onSet: () => void;
  busyAction: BusyAction;
}) {
  const theme = useTheme();
  return (
    <AnimatedButton
      onPress={onSet}
      style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
      disabled={busyAction === 'set'}
    >
      {busyAction === 'set' ? (
        <ActivityIndicator size="small" color="#131313" />
      ) : (
        <Ionicons name="phone-portrait-outline" size={18} color="#131313" />
      )}
      <Text style={styles.primaryBtnText}>Set as Wallpaper</Text>
    </AnimatedButton>
  );
}

/**
 * Secondary actions: Save + Add to pool.
 * Two outlined buttons side by side. Distinct from the
 * destructive / tertiary row below.
 */
export function SecondaryActions({
  onSave,
  onAddToMoodPool,
  busyAction,
}: {
  onSave: () => void;
  onAddToMoodPool: () => void;
  busyAction: BusyAction;
}) {
  const theme = useTheme();
  return (
    <View style={styles.secondaryRow}>
      <AnimatedButton
        onPress={onSave}
        style={[styles.secondaryBtn, { borderColor: theme.primary }]}
        disabled={busyAction === 'save'}
      >
        {busyAction === 'save' ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Ionicons name="download-outline" size={16} color={theme.primary} />
        )}
        <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
          Save to Gallery
        </Text>
      </AnimatedButton>
      <AnimatedButton
        onPress={onAddToMoodPool}
        style={[styles.secondaryBtn, { borderColor: theme.primary }]}
        disabled={busyAction === 'pool'}
      >
        {busyAction === 'pool' ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : (
          <Ionicons name="images-outline" size={16} color={theme.primary} />
        )}
        <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
          Add to pool
        </Text>
      </AnimatedButton>
    </View>
  );
}

/**
 * Tertiary actions: Retry + Discard.
 * Lightweight ghost buttons — clearly less prominent than
 * the primary/secondary set, but still tappable.
 */
export function TertiaryActions({
  onRetry,
  onDiscard,
}: {
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.tertiaryRow}>
      <AnimatedButton onPress={onRetry} style={styles.tertiaryBtn}>
        <Ionicons name="refresh" size={15} color={Colors.textDim} />
        <Text style={[styles.tertiaryBtnText, { color: Colors.textDim }]}>
          Retry with this prompt
        </Text>
      </AnimatedButton>
      <AnimatedButton onPress={onDiscard} style={styles.tertiaryBtn}>
        <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
        <Text style={[styles.tertiaryBtnText, { color: Colors.error }]}>
          Discard
        </Text>
      </AnimatedButton>
    </View>
  );
}
