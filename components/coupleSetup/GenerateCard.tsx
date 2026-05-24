import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import {
  couplePacks,
  type CoupleRole,
  type CouplePack,
} from '../../constants/couplePacks';
import { Colors, type ThemeDef } from '../../constants/theme';
import { styles } from './styles';

type Router = { replace: (href: Href) => void };

/**
 * GENERATE CARD — "I'm Person A". Pack picker (horizontal triptychs) + role
 * picker, then either the big code reveal (Copy / Share / Continue) or the
 * gated Generate button. Self-contained: all state + callbacks via props.
 */
export function GenerateCard({
  generatedCode,
  theme,
  chosenPackId,
  setChosenPackId,
  chosenRole,
  setChosenRole,
  chosenPack,
  busy,
  isCouplePremium,
  onCopy,
  onShare,
  onGenerate,
  router,
}: {
  generatedCode: string | null;
  theme: ThemeDef;
  chosenPackId: string;
  setChosenPackId: (id: string) => void;
  chosenRole: CoupleRole;
  setChosenRole: (r: CoupleRole) => void;
  chosenPack: CouplePack;
  busy: 'create' | 'accept' | null;
  isCouplePremium: boolean;
  onCopy: () => void;
  onShare: () => void;
  onGenerate: () => void;
  router: Router;
}) {
  return (
    <View
      style={[
        styles.card,
        generatedCode != null && { borderColor: theme.primary },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="qr-code" size={18} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            I'm Person A — give me a code
          </Text>
          <Text style={styles.cardBody}>
            Pick a starter pack and your side. Couple Premium required
            to generate.
          </Text>
        </View>
      </View>

      {/* PACK PICKER — horizontal scroll of triptychs */}
      {!generatedCode ? (
        <>
          <Text style={styles.sectionLabel}>1. Pick a pack</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.packRow}
          >
            {couplePacks.map((p) => {
              const selected = p.id === chosenPackId;
              return (
                <AnimatedButton
                  key={p.id}
                  onPress={() => setChosenPackId(p.id)}
                  style={[
                    styles.packCard,
                    selected && {
                      borderColor: p.accent,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <View style={styles.packTriptych}>
                    <Image
                      source={p.roleAImage}
                      style={styles.packSolo}
                      contentFit="cover"
                      transition={80}
                    />
                    <Image
                      source={p.togetherImage}
                      style={styles.packTogether}
                      contentFit="cover"
                      transition={80}
                    />
                    <Image
                      source={p.roleBImage}
                      style={styles.packSolo}
                      contentFit="cover"
                      transition={80}
                    />
                  </View>
                  <Text
                    style={[styles.packName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Text style={styles.packBlurb} numberOfLines={2}>
                    {p.blurb}
                  </Text>
                </AnimatedButton>
              );
            })}
          </ScrollView>

          {/* ROLE PICKER */}
          <Text style={styles.sectionLabel}>2. Which side are you?</Text>
          <View style={styles.roleRow}>
            {(['a', 'b'] as CoupleRole[]).map((r) => {
              const selected = r === chosenRole;
              const label = r === 'a' ? chosenPack.roleALabel : chosenPack.roleBLabel;
              const emoji = r === 'a' ? chosenPack.roleAEmoji : chosenPack.roleBEmoji;
              const img = r === 'a' ? chosenPack.roleAImage : chosenPack.roleBImage;
              return (
                <AnimatedButton
                  key={r}
                  onPress={() => setChosenRole(r)}
                  style={[
                    styles.roleCard,
                    selected && {
                      borderColor: chosenPack.accent,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Image
                    source={img}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={80}
                  />
                  <View style={styles.roleOverlay}>
                    <Text style={styles.roleEmoji}>{emoji ?? '·'}</Text>
                    <Text style={styles.roleLabel}>{label}</Text>
                    <Text style={styles.roleSub}>
                      {selected ? '✓ Your side' : 'tap to pick'}
                    </Text>
                  </View>
                </AnimatedButton>
              );
            })}
          </View>
        </>
      ) : null}

      {generatedCode ? (
        <View style={styles.codeWrap}>
          <Text style={[styles.codeText, { color: theme.primary }]}>
            {generatedCode}
          </Text>
          <Text style={styles.codeMeta}>
            You · {chosenPack.name} · {chosenRole === 'a' ? chosenPack.roleALabel : chosenPack.roleBLabel}
            {chosenRole === 'a' ? ` ${chosenPack.roleAEmoji ?? ''}` : ` ${chosenPack.roleBEmoji ?? ''}`}
          </Text>
          <View style={styles.codeBtnRow}>
            <AnimatedButton
              onPress={onCopy}
              style={[styles.smallBtn, { borderColor: theme.primary }]}
            >
              <Ionicons name="copy-outline" size={14} color={theme.primary} />
              <Text style={[styles.smallBtnText, { color: theme.primary }]}>
                Copy
              </Text>
            </AnimatedButton>
            <AnimatedButton
              onPress={onShare}
              style={[styles.smallBtn, { borderColor: theme.primary }]}
            >
              <Ionicons name="share-outline" size={14} color={theme.primary} />
              <Text style={[styles.smallBtnText, { color: theme.primary }]}>
                Share
              </Text>
            </AnimatedButton>
          </View>
          <AnimatedButton
            onPress={() => router.replace('/couple/linking' as Href)}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.primaryBtnText}>Continue → Waiting room</Text>
          </AnimatedButton>
        </View>
      ) : (
        <AnimatedButton
          onPress={onGenerate}
          disabled={busy != null}
          style={[
            styles.primaryBtn,
            {
              backgroundColor: isCouplePremium ? theme.primary : Colors.surfaceHi,
              opacity: busy === 'create' ? 0.6 : 1,
            },
          ]}
        >
          <Ionicons
            name={isCouplePremium ? 'sparkles' : 'lock-closed'}
            size={16}
            color={isCouplePremium ? '#131313' : Colors.textDim}
          />
          <Text
            style={[
              styles.primaryBtnText,
              { color: isCouplePremium ? '#131313' : Colors.textDim },
            ]}
          >
            {busy === 'create' ? 'Generating…' : 'Generate code'}
          </Text>
        </AnimatedButton>
      )}
    </View>
  );
}
