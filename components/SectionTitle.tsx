import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '../constants/theme';

type Props = { title: string; caption?: string; onSeeAll?: () => void };

function SectionTitleBase({ title, caption, onSeeAll }: Props) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.title}>{title}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <Pressable onPress={onSeeAll} style={styles.cta} hitSlop={8}>
        <Text style={styles.ctaText}>See all</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.lavender} />
      </Pressable>
    </View>
  );
}

export const SectionTitle = memo(SectionTitleBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { color: Colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  caption: { color: Colors.textDim, fontSize: 12, fontWeight: '500', marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { color: Colors.lavender, fontSize: 13, fontWeight: '700' },
});
