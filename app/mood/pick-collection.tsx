import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { Colors, Spacing } from '../../constants/theme';
import { styles } from '../../components/moodPickCollection/styles';
import { usePickCollection } from '../../hooks/usePickCollection';

/**
 * Per-route Expo Router error boundary. Replaces the previous behaviour
 * where a render-time throw from this screen (most reliably reproduced by
 * the user via "Build full album → blank flash → back to phone launcher")
 * would crash the whole JS bundle and drop the user at the OS home screen.
 *
 * Returning a salvageable screen lets the user back out instead of force-
 * killing the app, and the `console.warn` leaves a logcat trail to find
 * the underlying cause on the next repro.
 */
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  console.warn('[mood/pick-collection] render crash:', error);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.errorWrap}>
        <Ionicons name="alert-circle" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>Couldn’t open the pool picker</Text>
        <Text style={styles.errorMsg}>
          {error?.message ?? 'Something went wrong while loading your pools.'}
        </Text>
        <AnimatedButton
          onPress={() => {
            void retry();
          }}
          style={[styles.errorBtn, { borderColor: Colors.pink }]}
        >
          <Text style={[styles.errorBtnText, { color: Colors.pink }]}>Try again</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

/**
 * Mood Mode — Collection picker.
 *
 * Lists every available pool the user can drive Mood Mode from:
 *   1. User-built Collections (`!seedPackId`)
 *   2. Activated built-in theme packs
 *   3. Inactive built-in theme packs (tappable → `activateBuiltinPack`)
 *
 * Each row shows a hero thumb, name, photo count, and a 7-mood balance bar
 * so the user sees at a glance whether their pool covers every emotion the
 * detector could throw at it.
 */
export default function MoodPickCollection() {
  const { theme, allRows, onCreate, renderItem, router } = usePickCollection();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Pick a pool</Text>
          <Text style={styles.subtitle}>
            Mood Mode will pull wallpapers from this collection
          </Text>
        </View>
      </View>

      <FlatList
        data={allRows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.sm }}>
            <AnimatedButton
              onPress={onCreate}
              style={[styles.createRow, { borderColor: theme.primary }]}
            >
              <View
                style={[
                  styles.createIcon,
                  { borderColor: theme.primary, backgroundColor: 'rgba(250,179,202,0.10)' },
                ]}
              >
                <Ionicons name="add" size={26} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.createTitle, { color: theme.text }]}>
                  Create your own pool
                </Text>
                <Text style={styles.createCaption}>
                  Pick 10 photos — from the app, your gallery, or any image URL
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
            </AnimatedButton>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No packs yet — tap “Create your own pool” above to start.
          </Text>
        }
      />
    </SafeAreaView>
  );
}
