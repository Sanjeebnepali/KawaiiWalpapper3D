import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { getPhotoById } from '../../constants/mockData';
import { type Collection } from '../../constants/shuffle';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

export function ActiveBanner({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Use the first photo as the banner backdrop for a premium glow.
  const bg = getPhotoById(collection.photoIds[0] ?? '')?.image;
  return (
    <AnimatedButton onPress={onPress} style={[styles.activeBanner, { borderColor: theme.primary }]}>
      {bg ? (
        <Image
          source={{ uri: bg }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          blurRadius={20}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.activeBannerIcon,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
        ]}
      >
        <Ionicons name="play" size={16} color="#131313" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: theme.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={[styles.bannerSub, { color: theme.primary }]} numberOfLines={1}>
          Live · tap to view countdown
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.text} />
    </AnimatedButton>
  );
}
