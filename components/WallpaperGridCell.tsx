import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../constants/theme';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useIsFavorite, useToggleFavorite } from '../store/favorites';
import { SimpleButton } from './SimpleButton';

export type WallpaperGridCellProps = {
  id: string;
  image: string;
  width: number;
  height: number;
  accent?: string;
  title?: string;
  /** Show the favorite heart toggle (wired to the favorites store). */
  showHeart?: boolean;
  /** Stable callbacks — parents should pass useCallback'd refs so memo holds. */
  onOpen: (id: string) => void;
  onLongPress?: (id: string) => void;
};

/**
 * Shared square cell for the 2-column photo grids (category, couple, mood,
 * search results). Memoized + self-contained favorite state so a heart toggle
 * only re-renders its own cell, not the whole list.
 *
 * Uses `SimpleButton` (native Pressable opacity feedback) instead of
 * `AnimatedButton` — for a 30-cell grid that's 60 fewer Reanimated
 * worklet bridges to set up on mount. Replaces the per-cell
 * `<LinearGradient>` bottom-fade with a flat absolute View — same text
 * contrast effect, near-zero paint cost (changes/032).
 */
function WallpaperGridCellBase({
  id,
  image,
  width,
  height,
  accent: _accent = Colors.pink,
  title,
  showHeart = true,
  onOpen,
  onLongPress,
}: WallpaperGridCellProps) {
  const isFav = useIsFavorite(id);
  const toggleFav = useToggleFavorite();
  const { requireAuth } = useRequireAuth();

  // Warm expo-image's disk+memory cache on press-in so the preview
  // screen's <Image> can pull the bitmap from cache.
  const handlePressIn = useCallback(() => {
    Image.prefetch(image);
  }, [image]);

  const handleOpen = useCallback(() => onOpen(id), [onOpen, id]);
  const handleLongPress = useCallback(
    () => onLongPress?.(id),
    [onLongPress, id],
  );
  // Favorites require an account so they can sync to the user's profile
  // (Phase 2). Anonymous tap surfaces the Sign-in prompt.
  const handleHeart = useCallback(
    () => requireAuth(() => toggleFav(id)),
    [requireAuth, toggleFav, id],
  );

  return (
    <SimpleButton
      onPressIn={handlePressIn}
      onPress={handleOpen}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={300}
      style={[styles.cell, { width, height }]}
    >
      <Image
        source={{ uri: image }}
        style={styles.img}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={id}
      />
      {/* Flat dark overlay (replaces LinearGradient — see changes/032).
          Same contrast against the white title text, ~10× cheaper to paint. */}
      <View style={styles.fade} pointerEvents="none" />
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {showHeart ? (
        <SimpleButton onPress={handleHeart} hitSlop={6} style={styles.heartBtn}>
          <Ionicons
            name={isFav ? 'heart' : 'heart-outline'}
            size={16}
            color={isFav ? Colors.pink : Colors.text}
          />
        </SimpleButton>
      ) : null}
    </SimpleButton>
  );
}

export const WallpaperGridCell = memo(WallpaperGridCellBase);

const styles = StyleSheet.create({
  cell: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  img: { width: '100%', height: '100%' },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  heartBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
