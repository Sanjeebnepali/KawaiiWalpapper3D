import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * Preview header — back button + title/subtitle. Presentational: takes the
 * back handler plus the model/duration to render, owns no screen state.
 */
export function PreviewHeader({
  onBack,
  model,
  durationMs,
}: {
  onBack: () => void;
  model: string;
  durationMs: number;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <AnimatedButton onPress={onBack} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </AnimatedButton>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          AI generation
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {model.split('/').pop() ?? model}
          {durationMs > 0 ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
        </Text>
      </View>
    </View>
  );
}
