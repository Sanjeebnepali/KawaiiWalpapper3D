import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { couplePacks } from '../../constants/couplePacks';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

type CouplePackPickerProps = {
  packId: string | null;
  picking: boolean;
  onPickPack: (newPackId: string) => void;
};

export function CouplePackPicker({ packId, picking, onPickPack }: CouplePackPickerProps) {
  const theme = useTheme();
  return (
    /* ─── Pack picker — full-width triptychs ─── */
    <View style={styles.card}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        Choose a couple pack
      </Text>
      <Text style={styles.cardSubtle}>
        Either of you can pick. The pack defines the together image AND
        both solo halves. Role labels (Boy/Girl, Sun/Moon, …) come from
        the pack — your side stays the same when you switch packs.
      </Text>
      <View style={styles.packGrid}>
        {couplePacks.map((p) => {
          const selected = p.id === packId;
          return (
            <AnimatedButton
              key={p.id}
              onPress={() => !picking && onPickPack(p.id)}
              style={[
                styles.packTile,
                selected && {
                  borderColor: p.accent,
                  borderWidth: 2,
                },
              ]}
            >
              <View style={styles.packTileTriptych}>
                <Image
                  source={p.roleAImage}
                  style={styles.packTileSolo}
                  contentFit="cover"
                />
                <Image
                  source={p.togetherImage}
                  style={styles.packTileTogether}
                  contentFit="cover"
                />
                <Image
                  source={p.roleBImage}
                  style={styles.packTileSolo}
                  contentFit="cover"
                />
              </View>
              <View style={styles.packTileMeta}>
                <Text
                  style={[styles.packTileName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
                <Text style={styles.packTileBlurb} numberOfLines={1}>
                  {p.roleALabel} · {p.roleBLabel}
                </Text>
              </View>
              {selected ? (
                <View
                  style={[styles.selectedDot, { backgroundColor: p.accent }]}
                >
                  <Ionicons name="checkmark" size={12} color="#131313" />
                </View>
              ) : null}
            </AnimatedButton>
          );
        })}
      </View>
    </View>
  );
}
