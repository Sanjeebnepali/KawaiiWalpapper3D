import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { memo } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { getAvatar } from '../constants/avatars';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/auth';
import { SimpleButton } from './SimpleButton';

function HeaderBase() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const theme = useTheme();
  const searchWidth = Math.round(width * 0.9);

  // Profile avatar — same source-of-truth as Settings page's profile
  // header. Reading via a Zustand selector so the Header re-renders
  // when the user changes their avatar in profile-setup. `profile`
  // is `null` for guest / unauthed users → fallback to the generic
  // person icon.
  const profile = useAuthStore((s) => s.profile);
  const avatar = profile?.avatar_id ? getAvatar(profile.avatar_id) : null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <SimpleButton
          hitSlop={6}
          style={[styles.logoWrap, { shadowColor: theme.primary }]}
        >
          <Image
            source={require('../assets/logo-kawaii.png')}
            style={styles.logoImg}
            contentFit="cover"
          />
        </SimpleButton>

        <View style={styles.brandWrap}>
          <Text style={[styles.brand, { color: theme.text }]} numberOfLines={1}>
            Kawaii Baby HD
          </Text>
          <Text style={styles.brandSub} numberOfLines={1}>
            AI-generated · 4K
          </Text>
        </View>

        <SimpleButton
          style={[
            styles.profileBtn,
            // When an avatar is set, drop the surface bg + border that
            // wrap the generic person icon — the avatar circle below
            // owns the visual. Keeps the 40×40 tap target identical
            // to the guest state.
            avatar && {
              backgroundColor: 'transparent',
              borderWidth: 0,
            },
          ]}
          hitSlop={8}
          onPress={() => router.push('/profile')}
        >
          {avatar ? (
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: avatar.color, shadowColor: theme.primary },
              ]}
            >
              <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
            </View>
          ) : (
            <Ionicons name="person" size={18} color={Colors.text} />
          )}
          <View style={styles.dot} />
        </SimpleButton>
      </View>

      <View style={styles.searchRow}>
        <SimpleButton
          onPress={() => router.push('/search' as Href)}
          style={[styles.search, { width: searchWidth }]}
        >
          <Ionicons name="search" size={18} color={Colors.textDim} />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            Search kawaii wallpapers
          </Text>
          <Ionicons name="options-outline" size={18} color={Colors.textDim} />
        </SimpleButton>
      </View>
    </View>
  );
}

export const Header = memo(HeaderBase);

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: Colors.pink,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  brandWrap: { flex: 1 },
  brand: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSub: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  avatarEmoji: {
    fontSize: 20,
    lineHeight: 22,
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.cyan,
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },
  searchRow: {
    alignItems: 'center',
    paddingTop: Spacing.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderRadius: 24,
  },
  searchPlaceholder: {
    flex: 1,
    color: Colors.textMute,
    fontSize: 14,
    fontWeight: '500',
  },
});
