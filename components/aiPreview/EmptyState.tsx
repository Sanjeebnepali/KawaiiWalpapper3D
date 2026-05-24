import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * Empty state shown when the preview route is opened without a `uri`
 * search param. Presentational: takes the back handler, owns no screen
 * state.
 */
export function EmptyState({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <AnimatedButton onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>No image</Text>
      </View>
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>
          The generation link is missing its image URI. Go back and try again.
        </Text>
      </View>
    </SafeAreaView>
  );
}
