import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SimpleButton } from '../SimpleButton';
import { type CoupleWallpaper } from '../../constants/mockData';
import { styles } from './styles';

/**
 * A single couple-pack card. Shows ONLY the together image (the complete
 * two-character scene) — the boy/girl solo halves are never shown here;
 * they're revealed on the preview screen after a tap. Glows its pack accent.
 */
export const CoupleCard = memo(function CoupleCard({
  item,
  width,
  height,
  onOpen,
}: {
  item: CoupleWallpaper;
  width: number;
  height: number;
  onOpen: (packId: string) => void;
}) {
  const handlePress = useCallback(() => onOpen(item.id), [onOpen, item.id]);
  return (
    <SimpleButton
      onPress={handlePress}
      style={[
        styles.card,
        { width, height, shadowColor: item.accent, borderColor: item.accent + '55' },
      ]}
    >
      <Image
        source={item.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={140}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.cardBadge, { backgroundColor: item.accent }]}>
        <Ionicons name="heart" size={11} color="#131313" />
        <Text style={styles.cardBadgeText}>Couple</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardHint} numberOfLines={1}>
          Tap to pick your side
        </Text>
      </View>
    </SimpleButton>
  );
});
