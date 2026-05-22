import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../constants/theme';

export type VideoPlayerProps = {
  videoUri: string;
  title?: string;
  onClose: () => void;
  autoPlay?: boolean;
};

/**
 * Full-screen video player with:
 * - Play/pause toggle
 * - Mute toggle
 * - Loading skeleton
 * - Error boundary
 * - Looping playback
 */
export function VideoPlayer({
  videoUri,
  title,
  onClose,
  autoPlay = true,
}: VideoPlayerProps) {
  const { width, height } = useWindowDimensions();
  // Safe-area insets so the close button and controls clear notches /
  // the home indicator (Issue 3). VideoView itself fills edge-to-edge.
  const insets = useSafeAreaInsets();
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  // expo-video reports load/error state through the player's `statusChange`
  // event — there is no `onStatusUpdate` prop on <VideoView>.
  const statusEvent = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const status = statusEvent?.status;

  useEffect(() => {
    if (status === 'readyToPlay') {
      setIsLoading(false);
    } else if (status === 'loading') {
      setIsLoading(true);
    } else if (status === 'error') {
      console.warn('[VideoPlayer] video failed to load:', videoUri);
      setError('Video failed to load. Check your connection.');
    }
  }, [status, videoUri]);

  // `player.play()` / `player.pause()` are synchronous (void) in expo-video,
  // so they can't be `.catch()`-ed — guard with a try/catch instead.
  useEffect(() => {
    try {
      if (isPlaying) player.play();
      else player.pause();
    } catch {
      setError('Failed to play video');
    }
  }, [isPlaying, player]);

  useEffect(() => {
    if (!player) return;
    player.muted = isMuted;
  }, [isMuted, player]);

  const togglePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  if (error) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { top: insets.top + Spacing.sm }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.errorText}>Failed to load video</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
          <Pressable onPress={onClose} style={styles.retryBtn}>
            <Text style={styles.retryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Video fills edge-to-edge, behind every overlay. */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
      />

      {/* Close Button */}
      <Pressable
        onPress={onClose}
        style={[styles.closeBtn, { top: insets.top + Spacing.sm }]}
        hitSlop={8}
      >
        <Ionicons name="close" size={24} color={Colors.text} />
      </Pressable>

      {/* Loading skeleton */}
      {isLoading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.pink} size="large" />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      )}

      {/* Controls Overlay — padded above the home indicator */}
      <View
        style={[
          styles.controls,
          { paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        {title && (
          <View style={styles.titleBar}>
            <Text style={styles.videoTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}

        <View style={styles.buttons}>
          <Pressable onPress={togglePlayPause} style={styles.btn} hitSlop={8}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={Colors.text}
            />
          </Pressable>

          <Pressable onPress={toggleMute} style={styles.btn} hitSlop={8}>
            <Ionicons
              name={isMuted ? 'volume-mute' : 'volume-high'}
              size={24}
              color={Colors.text}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    position: 'absolute',
    alignItems: 'center',
    gap: Spacing.md,
    zIndex: 8,
  },
  loadingText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  titleBar: {
    marginBottom: Spacing.sm,
  },
  videoTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorWrap: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: '700',
  },
  errorSubtext: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.pink,
    marginTop: Spacing.md,
  },
  retryText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '700',
  },
});
