import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../constants/theme';
import { SimpleButton } from './SimpleButton';

export type VideoWallpaperCardProps = {
  id: string;
  thumbnail: string;
  title: string;
  duration: string;
  width: number;
  height: number;
  onPlay: (id: string) => void;
  /**
   * Optional long-press handler — wired by `wallpapers/video.tsx` to the
   * system share sheet. Stable callback expected so the `memo` wrapper holds.
   */
  onLongPress?: (id: string) => void;
};

/**
 * Video wallpaper card with thumbnail, play button, and metadata.
 * Memoized + uses `SimpleButton` instead of `AnimatedButton` to skip the
 * Reanimated worklet cost per cell (changes/032). Flat overlay replaces
 * the per-cell `LinearGradient`.
 */
function VideoWallpaperCardBase({
  id,
  thumbnail,
  title,
  duration,
  width,
  height,
  onPlay,
  onLongPress,
}: VideoWallpaperCardProps) {
  const handlePress = useCallback(() => onPlay(id), [onPlay, id]);
  const handleLongPress = useCallback(
    () => onLongPress?.(id),
    [onLongPress, id],
  );
  return (
    <SimpleButton
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={300}
      style={[styles.cell, { width, height }]}
    >
      <Image
        source={{ uri: thumbnail }}
        style={styles.thumbnail}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={id}
      />
      <View style={styles.fade} pointerEvents="none" />
      <View style={styles.playBtn}>
        <Ionicons name="play" size={24} color="#131313" />
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.duration}>{duration}</Text>
      </View>
    </SimpleButton>
  );
}

export const VideoWallpaperCard = memo(VideoWallpaperCardBase);

const styles = StyleSheet.create({
  cell: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 50,
    height: 50,
    marginTop: -25,
    marginLeft: -25,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  duration: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
