import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import type { AspectRatio } from '../../lib/ai/types';
import { ASPECTS } from './constants';
import { styles } from './styles';

type Props = {
  aspect: AspectRatio;
  setAspect: (a: AspectRatio) => void;
  busy: boolean;
};

export function AspectChips({ aspect, setAspect, busy }: Props) {
  const theme = useTheme();
  return (
    /* Aspect chip row */
    <View style={styles.aspectRow}>
      {ASPECTS.map((a) => {
        const active = a.id === aspect;
        return (
          <Pressable
            key={a.id}
            onPress={() => setAspect(a.id)}
            style={[
              styles.aspectChip,
              active && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
            disabled={busy}
          >
            <Text
              style={[
                styles.aspectText,
                active && { color: '#131313' },
              ]}
            >
              {a.label} · {a.id}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
