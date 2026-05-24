import { Linking, Share, Text } from 'react-native';
import {
  PRIVACY_URL,
  STORE_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
} from '../../lib/settingsConstants';
import { RowValue, SettingsRow, SettingsSection } from '../SettingsControls';
import { styles } from './styles';

/**
 * "Privacy & Legal" + "About" sections. Self-contained — opens the legal
 * URLs / mail / store links itself; the data-export and account-deletion
 * handlers are passed in from the screen since they touch app state.
 */
export function PrivacyAboutSections({
  version,
  onExportData,
  onDeleteAccount,
}: {
  version: string;
  onExportData: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <>
      {/* 1.7 Privacy & Legal */}
      <SettingsSection title="Privacy & Legal">
        <SettingsRow
          icon="document-text-outline"
          label="Terms of Service"
          right={<RowValue chevron="external" />}
          onPress={() => Linking.openURL(TERMS_URL)}
        />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          right={<RowValue chevron="external" />}
          onPress={() => Linking.openURL(PRIVACY_URL)}
        />
        <SettingsRow
          icon="download-outline"
          label="Export Data"
          right={<RowValue />}
          onPress={onExportData}
        />
        <SettingsRow
          icon="trash-outline"
          label="Delete Account"
          danger
          onPress={onDeleteAccount}
          divider={false}
        />
      </SettingsSection>

      {/* 1.8 About */}
      <SettingsSection title="About">
        <SettingsRow label="App Version" right={<Text style={styles.version}>v{version}</Text>} />
        <SettingsRow
          icon="star-outline"
          label="Rate Us"
          right={<RowValue />}
          onPress={() => Linking.openURL(STORE_URL)}
        />
        <SettingsRow
          icon="share-social-outline"
          label="Share App"
          right={<RowValue />}
          onPress={() =>
            Share.share({ message: 'Check out Kawaii Baby Wallpapers HD!' })
          }
        />
        <SettingsRow
          icon="mail-outline"
          label="Contact Support"
          right={<RowValue />}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          divider={false}
        />
      </SettingsSection>
    </>
  );
}
