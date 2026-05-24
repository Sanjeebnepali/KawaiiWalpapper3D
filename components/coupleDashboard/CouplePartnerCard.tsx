import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

type CouplePartnerCardProps = {
  partnerName: string;
  partnerRoleEmoji: string | null | undefined;
  code: string;
  myRoleEmoji: string | null | undefined;
  myRoleLabel: string;
  partnerRoleLabel: string;
  proximityColor: string;
  proximityLabel: string;
  distanceLabel: string;
  lastUpdate: string;
  paused: boolean;
};

export function CouplePartnerCard({
  partnerName,
  partnerRoleEmoji,
  code,
  myRoleEmoji,
  myRoleLabel,
  partnerRoleLabel,
  proximityColor,
  proximityLabel,
  distanceLabel,
  lastUpdate,
  paused,
}: CouplePartnerCardProps) {
  const theme = useTheme();
  return (
    /* ─── Partner card ─── */
    <View style={[styles.card, { borderColor: proximityColor + '66' }]}>
      <View style={styles.partnerRow}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Ionicons name="person" size={26} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.partnerName, { color: theme.text }]}>
            {partnerName}{' '}
            {partnerRoleEmoji ? (
              <Text style={styles.partnerRoleEmoji}>{partnerRoleEmoji}</Text>
            ) : null}
          </Text>
          <Text style={styles.partnerSub}>
            {code} · You: {myRoleEmoji ?? ''} {myRoleLabel} · Them:{' '}
            {partnerRoleEmoji ?? ''} {partnerRoleLabel}
          </Text>
        </View>
        <View style={[styles.statusPill, { borderColor: proximityColor }]}>
          <View
            style={[styles.statusDot, { backgroundColor: proximityColor }]}
          />
          <Text style={[styles.statusPillText, { color: proximityColor }]}>
            {proximityLabel}
          </Text>
        </View>
      </View>

      <View style={styles.distanceRow}>
        <Text style={[styles.distanceBig, { color: theme.text }]}>
          {distanceLabel}
        </Text>
        <Text style={styles.distanceSub}>Updated {lastUpdate}</Text>
      </View>

      {paused ? (
        <View style={styles.banner}>
          <Ionicons name="pause-circle" size={14} color={Colors.gold} />
          <Text style={[styles.bannerText, { color: Colors.gold }]}>
            Location sharing paused — proximity stays "apart"
          </Text>
        </View>
      ) : null}
    </View>
  );
}
