import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AnimatedButton } from '../AnimatedButton';
import { Colors, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

/** Not-found fallback — rendered when the pool id resolves to nothing. */
export function PoolNotFound({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <AnimatedButton
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>Pool not found</Text>
      </View>
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>
          This pool may have been deleted. Go back and pick another one.
        </Text>
      </View>
    </SafeAreaView>
  );
}

/** Top header — back button, pool name, optional delete (user pools only). */
export function PoolHeader({
  name,
  isUserPool,
  onBack,
  onDelete,
}: {
  name: string;
  isUserPool: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <AnimatedButton onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </AnimatedButton>
      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {name}
      </Text>
      {isUserPool ? (
        <AnimatedButton
          onPress={onDelete}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </AnimatedButton>
      ) : (
        <View style={styles.headerPlaceholder} />
      )}
    </View>
  );
}

/** CTA — use as mood pool / active indicator. */
export function PoolCta({
  isActiveMood,
  onUseAsMood,
}: {
  isActiveMood: boolean;
  onUseAsMood: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.ctaRow}>
      <AnimatedButton
        onPress={onUseAsMood}
        style={[
          styles.ctaPrimary,
          isActiveMood
            ? { backgroundColor: Colors.surface, borderColor: theme.primary, borderWidth: 1.5 }
            : { backgroundColor: theme.primary },
        ]}
      >
        <Ionicons
          name={isActiveMood ? 'checkmark-circle' : 'sparkles-outline'}
          size={18}
          color={isActiveMood ? theme.primary : '#131313'}
        />
        <Text
          style={[
            styles.ctaPrimaryText,
            { color: isActiveMood ? theme.primary : '#131313' },
          ]}
        >
          {isActiveMood
            ? 'Active for Mood Mode'
            : 'Use this pool for Mood Mode'}
        </Text>
      </AnimatedButton>
    </View>
  );
}

/* Bottom action bar — user pools only. Curated packs can't be edited.
 *   paddingBottom inline = the safe-area inset bottom (gesture bar /
 *   3-button nav height) + a Spacing.md visual breathing margin, so
 *   the button never gets clipped by the OS nav and always has a
 *   consistent gap above the system UI. */
export function PoolFooter({
  bottomInset,
  onAddPress,
}: {
  bottomInset: number;
  onAddPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: bottomInset + Spacing.md },
      ]}
    >
      <AnimatedButton
        onPress={onAddPress}
        style={[styles.addBtn, { borderColor: theme.primary }]}
      >
        <Ionicons name="add" size={18} color={theme.primary} />
        <Text style={[styles.addBtnText, { color: theme.primary }]}>
          Add photos
        </Text>
      </AnimatedButton>
    </View>
  );
}
