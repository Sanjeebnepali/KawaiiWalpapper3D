import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

export function ThemePacksHeader({
  onBack,
  onHistory,
}: {
  onBack: () => void;
  onHistory: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <AnimatedButton
        onPress={onBack}
        style={styles.iconBtn}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </AnimatedButton>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Theme Packs
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Auto-shuffle premium wallpaper sets
        </Text>
      </View>
      <AnimatedButton
        onPress={onHistory}
        style={styles.iconBtn}
        hitSlop={6}
      >
        <Ionicons name="time-outline" size={20} color={theme.text} />
      </AnimatedButton>
    </View>
  );
}
