import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { categoryIcons } from '../constants/mockData';
import { Spacing } from '../constants/theme';
import { PremiumIcon } from './PremiumIcon';

function CategoryIconsBase() {
  const router = useRouter();
  // No local "active" state — the source of truth is the category route the
  // user navigates to. Now there are 14 themed categories, so the row
  // scrolls horizontally instead of trying to fit 4 fixed icons.
  const onPress = useCallback(
    (id: string) => router.push(`/category/${id}`),
    [router],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {categoryIcons.map((c) => (
        <PremiumIcon
          key={c.id}
          icon={c.icon as keyof typeof Ionicons.glyphMap}
          tint={c.tint}
          label={c.label}
          onPress={() => onPress(c.id)}
        />
      ))}
    </ScrollView>
  );
}

export const CategoryIcons = memo(CategoryIconsBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 8,
  },
});
