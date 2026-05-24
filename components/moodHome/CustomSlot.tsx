import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { resolveCustomImage } from './helpers';
import { swStyles } from './styles';

/** Single slot in the custom-pair picker showing the assigned image (or
 *  a placeholder). Lives inside the same module so the styles + image
 *  resolver share scope without an extra import. */
export function CustomSlot({
  label,
  photoId,
}: {
  label: string;
  photoId: string | null;
}) {
  const image = resolveCustomImage(photoId);
  return (
    <View style={swStyles.slot}>
      <Text style={swStyles.slotLabel}>{label}</Text>
      {image ? (
        <Image
          source={{ uri: image }}
          style={swStyles.slotImage}
          contentFit="cover"
          transition={80}
        />
      ) : (
        <View style={[swStyles.slotImage, swStyles.slotEmpty]}>
          <Ionicons name="add" size={28} color={Colors.textDim} />
        </View>
      )}
    </View>
  );
}
