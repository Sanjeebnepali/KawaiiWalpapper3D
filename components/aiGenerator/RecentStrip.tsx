import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { AIGeneration } from '../../store/ai';
import { styles } from './styles';

type Props = {
  history: AIGeneration[];
  onOpen: (g: AIGeneration) => void;
  onDelete: (localUri: string) => void;
};

export function RecentStrip({ history, onOpen, onDelete }: Props) {
  return (
    /* Recent generations strip */
    <Animated.View entering={FadeInDown.delay(290).springify().damping(18)}>
      <View style={styles.recentHead}>
        <Text style={styles.section}>Recent generations</Text>
        <Text style={styles.recentHint}>Long-press to delete</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentRow}
        alwaysBounceHorizontal
        overScrollMode="always"
        decelerationRate="normal"
      >
        {history.slice(0, 10).map((g) => (
          <Pressable
            key={g.localUri}
            onPress={() => onOpen(g)}
            onLongPress={() => onDelete(g.localUri)}
            delayLongPress={350}
            style={styles.recentCell}
          >
            <Image
              source={{ uri: g.localUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={80}
              cachePolicy="memory-disk"
            />
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
