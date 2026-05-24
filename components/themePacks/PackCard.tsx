import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { type ThemePack } from '../../constants/mockData';
import { styles } from './styles';

export function PackCard({
  pack,
  hero,
  accent,
  width,
  height,
  isActive,
  onView,
  onShuffle,
  onConfigure,
}: {
  pack: ThemePack;
  hero: string;
  accent: string;
  width: number;
  height: number;
  isActive: boolean;
  onView: () => void;
  onShuffle: () => void;
  onConfigure: () => void;
}) {
  return (
    <View
      style={[
        styles.packCard,
        { width, height },
        isActive && { borderColor: accent, borderWidth: 1.5 },
      ]}
    >
      {/* Long-press anywhere on the card opens the edit screen (creates the
          backing Collection if needed) so the user can tweak timer / mode
          before — or after — starting the shuffle. */}
      <AnimatedButton
        onPress={onView}
        onLongPress={onConfigure}
        style={StyleSheet.absoluteFill}
        scaleTo={0.98}
      >
        <Image
          source={{ uri: hero }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[accent, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.packAccentStrip}
        />
      </AnimatedButton>

      <View style={styles.packTopRow} pointerEvents="none">
        <View style={[styles.countPill, { borderColor: accent }]}>
          <Ionicons name="images" size={9} color={accent} />
          <Text style={[styles.countPillText, { color: accent }]}>
            {pack.count}
          </Text>
        </View>
        {isActive ? (
          <View style={[styles.livePill, { backgroundColor: accent }]}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.packBottom}>
        <Text style={styles.packTitle} numberOfLines={1}>
          {pack.title}
        </Text>
        <Text style={styles.packSub} numberOfLines={1}>
          {pack.count} wallpapers
        </Text>
        <View style={styles.packActions}>
          <AnimatedButton
            onPress={onShuffle}
            style={[
              styles.shuffleCta,
              {
                backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : accent,
                borderColor: accent,
              },
            ]}
            scaleTo={0.94}
          >
            <Ionicons
              name={isActive ? 'sync' : 'play'}
              size={13}
              color={isActive ? accent : '#131313'}
            />
            <Text
              style={[
                styles.shuffleCtaText,
                { color: isActive ? accent : '#131313' },
              ]}
            >
              {isActive ? 'Shuffling' : 'Shuffle'}
            </Text>
          </AnimatedButton>
          {/* Active pack → opens edit screen so the user can tweak the
              timer / mode / etc. (Issue: built-in packs were previously
              uneditable — changes/024). Inactive pack → opens the
              read-only album browser. */}
          <AnimatedButton
            onPress={isActive ? onConfigure : onView}
            style={styles.viewCta}
            hitSlop={6}
            scaleTo={0.9}
          >
            <Ionicons
              name={isActive ? 'settings-outline' : 'albums-outline'}
              size={14}
              color="#FFF"
            />
          </AnimatedButton>
        </View>
      </View>
    </View>
  );
}
