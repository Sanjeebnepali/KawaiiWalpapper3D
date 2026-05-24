import { Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

export function SectionHeader({
  title,
  caption,
  marginTop,
}: {
  title: string;
  caption: string;
  marginTop?: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHead, marginTop ? { marginTop } : null]}>
      <View
        style={[styles.sectionDot, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={styles.sectionSub}>{caption}</Text>
      </View>
    </View>
  );
}
