import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import {
  type CouplePack,
  pickImageForState,
} from '../../constants/couplePacks';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

type CoupleActiveWallpaperCardProps = {
  activeImage: ReturnType<typeof pickImageForState> | null;
  activePack: CouplePack;
  myRoleLabel: string;
  onPreview: () => void;
};

export function CoupleActiveWallpaperCard({
  activeImage,
  activePack,
  myRoleLabel,
  onPreview,
}: CoupleActiveWallpaperCardProps) {
  const theme = useTheme();
  return (
    /* ─── Active wallpaper card ─── */
    <View style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          On your screen now
        </Text>
        <Text style={styles.cardSubtle}>
          {activeImage?.kind === 'together'
            ? 'Together — both phones'
            : `Solo (${myRoleLabel})`}
        </Text>
      </View>

      {activeImage ? (
        <View
          style={[
            styles.activeRow,
            { borderColor: activePack.accent + '88' },
          ]}
        >
          <Image
            source={activeImage.image}
            style={styles.activeThumb}
            contentFit="cover"
            transition={120}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.activeTitle, { color: theme.text }]} numberOfLines={1}>
              {activePack.name}
            </Text>
            <Text style={styles.activeSub}>
              {activeImage.kind === 'together'
                ? `Together image · applies on both phones`
                : `Your ${myRoleLabel} half`}
            </Text>
          </View>
          <AnimatedButton
            onPress={onPreview}
            style={styles.previewIconBtn}
          >
            <Ionicons name="eye-outline" size={18} color={Colors.textDim} />
          </AnimatedButton>
        </View>
      ) : (
        <View style={[styles.activeRow, styles.activeEmpty]}>
          <Ionicons name="heart-outline" size={22} color={Colors.textDim} />
          <Text style={styles.activeEmptyText}>
            Waiting for both sides to report in.
          </Text>
        </View>
      )}
    </View>
  );
}
