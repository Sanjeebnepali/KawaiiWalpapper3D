import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useCoupleStore } from '../../store/couple';

/** Relative-age label for a `Date.now()` timestamp, or a dash when null. */
function ageLabel(at: number | null): string {
  if (at == null) return 'never';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/**
 * Couple connection status — a live read-out of the proximity feature's state
 * (my location sent, partner location received, distance, proximity, last
 * error). The on-demand "Run connection check" button was removed per the
 * owner's request; the status card stays as an always-visible health view.
 */
export function CoupleDiagnostics() {
  const theme = useTheme();
  const myUpdatedAt = useCoupleStore((s) => s.myUpdatedAt);
  const partnerUpdatedAt = useCoupleStore((s) => s.partnerUpdatedAt);
  const distanceM = useCoupleStore((s) => s.partnerDistanceM);
  const proximity = useCoupleStore((s) => s.proximity);
  const error = useCoupleStore((s) => s.error);

  return (
    <View style={[styles.card, { borderColor: Colors.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>Connection status</Text>

      <Row label="My location sent" value={ageLabel(myUpdatedAt)} good={myUpdatedAt != null} />
      <Row
        label="Partner location received"
        value={ageLabel(partnerUpdatedAt)}
        good={partnerUpdatedAt != null}
      />
      <Row
        label="Distance"
        value={distanceM != null ? `${Math.round(distanceM)} m` : '—'}
        good={distanceM != null}
      />
      <Row label="Proximity" value={proximity} good={proximity !== 'unknown'} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: Colors.textDim }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: good ? Colors.cyan : Colors.gold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  title: { fontSize: 14, fontWeight: '800', marginBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, fontWeight: '700' },
  errorText: { color: Colors.gold, fontSize: 12, marginTop: 6 },
});
