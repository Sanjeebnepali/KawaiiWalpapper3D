import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { type ThemeDef } from '../../constants/theme';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * RESTORE banner (reinstalled device rejoins its existing couple).
 * Self-contained: all state arrives via props.
 */
export function RestoreBanner({
  onRestore,
  restoring,
  theme,
}: {
  onRestore: () => void;
  restoring: boolean;
  theme: ThemeDef;
}) {
  return (
    <AnimatedButton
      onPress={onRestore}
      disabled={restoring}
      style={[styles.restoreBtn, { borderColor: theme.primary + '88' }]}
    >
      <Ionicons
        name={restoring ? 'sync' : 'refresh'}
        size={16}
        color={theme.primary}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.restoreTitle, { color: theme.text }]}>
          {restoring ? 'Restoring…' : 'Already paired? Restore'}
        </Text>
        <Text style={styles.restoreSub}>
          Reinstalled or new phone — get back your existing pairing without a code.
        </Text>
      </View>
    </AnimatedButton>
  );
}
