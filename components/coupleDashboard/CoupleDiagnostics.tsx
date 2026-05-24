import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useCoupleStore } from '../../store/couple';
import {
  runCoupleConnectionCheck,
  type CoupleConnectionCheck,
} from '../../lib/coupleDiagnostics';
import { AnimatedButton } from '../AnimatedButton';

/** Relative-age label for a `Date.now()` timestamp, or a dash when null. */
function ageLabel(at: number | null): string {
  if (at == null) return 'never';
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/**
 * Couple connection diagnostics — surfaces the proximity feature's live state
 * + an on-demand end-to-end check, because every failure in the push/read path
 * is silenced in a release build (`if (__DEV__) console.warn`). Lets the user
 * (and us) see WHICH link is broken instead of an unexplained default distance.
 */
export function CoupleDiagnostics() {
  const theme = useTheme();
  const myUpdatedAt = useCoupleStore((s) => s.myUpdatedAt);
  const partnerUpdatedAt = useCoupleStore((s) => s.partnerUpdatedAt);
  const distanceM = useCoupleStore((s) => s.partnerDistanceM);
  const proximity = useCoupleStore((s) => s.proximity);
  const error = useCoupleStore((s) => s.error);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CoupleConnectionCheck | null>(null);

  const onRun = async () => {
    setRunning(true);
    try {
      setResult(await runCoupleConnectionCheck());
    } catch (e) {
      setResult({ lines: [`✗ Check crashed — ${(e as Error)?.message}`], ok: false });
    } finally {
      setRunning(false);
    }
  };

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

      <AnimatedButton
        onPress={onRun}
        disabled={running}
        style={[styles.btn, { backgroundColor: theme.primary }]}
      >
        {running ? (
          <ActivityIndicator color="#131313" size="small" />
        ) : (
          <>
            <Ionicons name="pulse" size={15} color="#131313" />
            <Text style={styles.btnText}>Run connection check</Text>
          </>
        )}
      </AnimatedButton>

      {result ? (
        <View style={styles.resultBox}>
          {result.lines.map((line, i) => (
            <Text
              key={i}
              style={[
                styles.resultLine,
                { color: line.startsWith('✗') ? Colors.gold : theme.text },
              ]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
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
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  btnText: { color: '#131313', fontWeight: '800', fontSize: 13 },
  resultBox: { marginTop: Spacing.sm, gap: 3 },
  resultLine: { fontSize: 12, lineHeight: 17 },
});
