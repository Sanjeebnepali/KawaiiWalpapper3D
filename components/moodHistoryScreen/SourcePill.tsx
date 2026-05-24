import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { type MoodSource } from '../../lib/moodHistory';
import { Colors } from '../../constants/theme';
import { styles } from './styles';

const SOURCE_STYLE: Record<
  MoodSource,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; dim: string }
> = {
  manual:       { label: 'Manual',  icon: 'hand-left-outline',   tint: Colors.pink,     dim: Colors.pinkDim },
  camera:       { label: 'Camera',  icon: 'scan-outline',        tint: Colors.cyan,     dim: Colors.cyanDim },
  background:   { label: 'Auto',    icon: 'sparkles-outline',    tint: Colors.cyan,     dim: Colors.cyanDim },
  notification: { label: 'Tap',     icon: 'notifications-outline', tint: Colors.gold,   dim: 'rgba(232,194,117,0.18)' },
  sleepwake:    { label: 'Sleep/Wake', icon: 'moon-outline',     tint: Colors.lavender, dim: Colors.lavenderDim },
};

export function SourcePill({ source }: { source: MoodSource }) {
  const s = SOURCE_STYLE[source] ?? SOURCE_STYLE.manual;
  return (
    <View style={[styles.srcPill, { backgroundColor: s.dim }]}>
      <Ionicons name={s.icon} size={10} color={s.tint} />
      <Text style={[styles.srcPillText, { color: s.tint }]}>{s.label}</Text>
    </View>
  );
}
