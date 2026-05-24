import { Ionicons } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { Fragment } from 'react';
import { Text, View } from 'react-native';
import { getAvatar } from '../../constants/avatars';
import { Colors } from '../../constants/theme';
import type { ThemeDef } from '../../constants/theme';
import type { AuthStatus, Profile } from '../../store/auth';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * Settings screen header (title + edit button) and profile row
 * (avatar ring + display name + email). Purely presentational — all auth
 * state and the edit-press handler are passed in via props.
 */
export function ProfileHeader({
  theme,
  authStatus,
  profile,
  user,
  onEditPress,
}: {
  theme: ThemeDef;
  authStatus: AuthStatus;
  profile: Profile | null;
  user: User | null;
  onEditPress: () => void;
}) {
  return (
    <Fragment>
      {/* 1.1 Header */}
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>Settings</Text>
        {authStatus === 'authed' ? (
          <AnimatedButton
            onPress={onEditPress}
            hitSlop={8}
            style={styles.editBtn}
          >
            <Ionicons name="pencil" size={18} color={Colors.text} />
          </AnimatedButton>
        ) : null}
      </View>

      {/* 1.2 Profile */}
      <View style={styles.profileRow}>
        <View style={[styles.avatarRing, { borderColor: theme.primary, shadowColor: theme.primary }]}>
          {profile?.avatar_id ? (
            <View
              style={[
                styles.avatar,
                { backgroundColor: getAvatar(profile.avatar_id).color },
              ]}
            >
              <Text style={styles.avatarEmoji}>
                {getAvatar(profile.avatar_id).emoji}
              </Text>
            </View>
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={34} color={Colors.text} />
            </View>
          )}
        </View>
        <Text style={styles.username}>
          {profile?.display_name ?? (user ? 'Kawaii User' : 'Guest')}
        </Text>
        <Text style={styles.email}>
          {user?.email ?? 'Not signed in'}
        </Text>
      </View>
    </Fragment>
  );
}
