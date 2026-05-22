import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { Glass } from './Glass';
import { SimpleButton } from './SimpleButton';

type Props = {
  image: string;
  title: string;
  tag: string;
  accent: string;
  width: number;
  height: number;
  onPress?: () => void;
};

export function GlassCard({ image, title, tag, accent, width, height, onPress }: Props) {
  return (
    <SimpleButton
      onPressIn={() => Image.prefetch(image)}
      onPress={onPress}
      style={[styles.wrap, { width, height }]}
    >
      <View style={styles.image}>
        <Image
          source={{ uri: image }}
          style={[StyleSheet.absoluteFill, styles.imageInner]}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.85)']}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.tag, { borderColor: accent }]}>
          <View style={[styles.tagDot, { backgroundColor: accent }]} />
          <Text style={[styles.tagText, { color: accent }]}>{tag}</Text>
        </View>

        <View style={styles.glassWrap}>
          <Glass intensity={40} tint="dark" style={styles.glass}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>HD · 9:16</Text>
              <Text style={[styles.meta, { color: accent }]}>Tap to preview</Text>
            </View>
          </Glass>
        </View>
      </View>
    </SimpleButton>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xxl,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  image: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  imageInner: {
    borderRadius: Radius.xxl,
  },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  glassWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassStroke,
  },
  glass: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.glassFill,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
});
