import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Colors } from '../../constants/theme';
import type { ThemeDef } from '../../constants/theme';
import type { AIProviderId } from '../../lib/ai/types';
import type { TokenCfg } from '../../lib/ai/tokens';
import { setTokenFor } from '../../lib/ai/tokens';
import { toast } from '../../lib/settingsConstants';
import { AnimatedButton } from '../AnimatedButton';
import { styles } from './styles';

/**
 * Body of the AI-token bottom sheet. The `PremiumSheet` wrapper + its ref
 * stay in the Settings screen; this is the purely-presentational inner
 * content, adapting to whichever provider is active via props.
 */
export function AiTokenSheetBody({
  theme,
  providerId,
  providerDisplayName,
  tokenCfg,
  activeToken,
  maskToken,
  tokenDraft,
  setTokenDraft,
  onDismiss,
}: {
  theme: ThemeDef;
  providerId: AIProviderId;
  providerDisplayName: string;
  tokenCfg: TokenCfg;
  activeToken: string;
  maskToken: (t: string) => string;
  tokenDraft: string;
  setTokenDraft: (t: string) => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.aiTokenBody}>
      <View style={styles.aiTokenStateRow}>
        <Ionicons
          name={activeToken ? 'person-circle' : 'flash'}
          size={14}
          color={activeToken ? theme.primary : Colors.cyan}
        />
        <Text style={styles.aiTokenStateText}>
          {activeToken
            ? `Active: your key (${maskToken(activeToken)})`
            : `Active: ${tokenCfg.emptyStatus}`}
        </Text>
      </View>

      <TextInput
        value={tokenDraft}
        onChangeText={setTokenDraft}
        placeholder={tokenCfg.placeholder}
        placeholderTextColor={Colors.textMute}
        style={styles.aiTokenInput}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={false}
        multiline
      />

      <Pressable
        onPress={async () => {
          try {
            const t = await Clipboard.getStringAsync();
            if (t) setTokenDraft(t.trim());
          } catch {
            /* ignore */
          }
        }}
        style={styles.aiTokenPaste}
      >
        <Ionicons name="clipboard-outline" size={14} color={Colors.textDim} />
        <Text style={styles.aiTokenPasteText}>Paste from clipboard</Text>
      </Pressable>

      <Text style={styles.aiTokenHint}>{tokenCfg.hint}</Text>

      <View style={styles.aiTokenBtnRow}>
        <AnimatedButton
          onPress={() => {
            setTokenFor(providerId, '');
            onDismiss();
            toast(`✓ ${tokenCfg.clearLabel}`);
          }}
          style={[styles.aiTokenBtn, styles.aiTokenBtnSecondary]}
        >
          <Text style={[styles.aiTokenBtnText, { color: Colors.textDim }]}>
            {tokenCfg.clearLabel}
          </Text>
        </AnimatedButton>
        <AnimatedButton
          onPress={() => {
            const clean = tokenDraft.trim();
            if (
              clean &&
              tokenCfg.requiredPrefix &&
              !clean.startsWith(tokenCfg.requiredPrefix)
            ) {
              toast(
                `That doesn't look like a ${providerDisplayName} key (expected "${tokenCfg.requiredPrefix}…").`,
              );
              return;
            }
            setTokenFor(providerId, clean);
            onDismiss();
            toast(clean ? '✓ Key saved' : 'Key cleared');
          }}
          style={[
            styles.aiTokenBtn,
            { backgroundColor: theme.primary },
          ]}
        >
          <Text style={[styles.aiTokenBtnText, { color: '#131313' }]}>
            Save
          </Text>
        </AnimatedButton>
      </View>
    </View>
  );
}
