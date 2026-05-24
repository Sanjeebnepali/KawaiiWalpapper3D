import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { type CoupleRole } from '../../constants/couplePacks';
import { Colors, type ThemeDef } from '../../constants/theme';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * ACCEPT CARD — "I'm Person B". Code input + optional role override chips
 * (Auto / Side A / Side B) + the Link button. Self-contained: all state +
 * callbacks via props.
 */
export function AcceptCard({
  theme,
  enterInput,
  setEnterInput,
  acceptRole,
  setAcceptRole,
  busy,
  onAccept,
}: {
  theme: ThemeDef;
  enterInput: string;
  setEnterInput: (t: string) => void;
  acceptRole: CoupleRole | null;
  setAcceptRole: (r: CoupleRole | null) => void;
  busy: 'create' | 'accept' | null;
  onAccept: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: Colors.cyan }]}>
          <Ionicons name="key" size={18} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            I'm Person B — I have a code
          </Text>
          <Text style={styles.cardBody}>
            Enter your partner's LOVE-XXXX code. Couple Premium
            unlocks automatically for you.
          </Text>
        </View>
      </View>

      <Pressable style={styles.input}>
        <TextInput
          value={enterInput}
          onChangeText={(t) => setEnterInput(t.toUpperCase())}
          placeholder="LOVE-ABCD"
          placeholderTextColor={Colors.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          style={[styles.inputText, { color: theme.text }]}
        />
      </Pressable>

      {/* OPTIONAL ROLE OVERRIDE */}
      <Text style={styles.sectionLabel}>Pick your side (optional)</Text>
      <Text style={styles.sectionSubLabel}>
        Leave on Auto and you'll get whichever side your partner didn't
        take. Or override here.
      </Text>
      <View style={styles.acceptRoleRow}>
        {(
          [
            { v: null, label: 'Auto', emoji: '🪄' },
            { v: 'a', label: 'Side A', emoji: '👈' },
            { v: 'b', label: 'Side B', emoji: '👉' },
          ] as { v: CoupleRole | null; label: string; emoji: string }[]
        ).map(({ v, label, emoji }) => {
          const selected = v === acceptRole;
          return (
            <AnimatedButton
              key={label}
              onPress={() => setAcceptRole(v)}
              style={[
                styles.acceptRoleChip,
                selected && {
                  borderColor: Colors.cyan,
                  backgroundColor: 'rgba(168,231,216,0.12)',
                },
              ]}
            >
              <Text style={styles.acceptRoleEmoji}>{emoji}</Text>
              <Text
                style={[
                  styles.acceptRoleLabel,
                  { color: selected ? Colors.cyan : Colors.textDim },
                ]}
              >
                {label}
              </Text>
            </AnimatedButton>
          );
        })}
      </View>

      <AnimatedButton
        onPress={onAccept}
        disabled={busy != null}
        style={[
          styles.primaryBtn,
          {
            backgroundColor: Colors.cyan,
            opacity: busy === 'accept' ? 0.6 : 1,
          },
        ]}
      >
        <Ionicons name="link" size={16} color="#131313" />
        <Text style={[styles.primaryBtnText, { color: '#131313' }]}>
          {busy === 'accept' ? 'Linking…' : 'Link with partner'}
        </Text>
      </AnimatedButton>
    </View>
  );
}
