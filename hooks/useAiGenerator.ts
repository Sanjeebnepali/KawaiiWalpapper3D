import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUGGESTIONS } from '../components/aiGenerator/constants';
import { premiumAlert } from '../components/PremiumAlert';
import { Colors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useRequireAuth } from './useRequireAuth';
import {
  deleteGeneration,
  generateImage,
} from '../lib/ai/client';
import { moderatePrompt, type ModerationVerdict } from '../lib/ai/promptModeration';
import { getProvider } from '../lib/ai/registry';
import type { AspectRatio } from '../lib/ai/types';
import { toast } from '../lib/toast';
import type { AIGeneration } from '../store/ai';
import { hydrateAIStore, useAIStore } from '../store/ai';

/**
 * Hook holding all of the AI Generator screen's stateful logic: prompt /
 * aspect state, the in-flight + abort + retry refs, the store reads, and
 * every handler closure (incl. the large `onGenerate` useCallback). The
 * screen component consumes the returned object and renders the JSX only.
 *
 * Extracted verbatim from `app/(tabs)/ai.tsx` with no behavioral change:
 * the hook-call order, every dependency array, and the `as Href` casts
 * are preserved exactly.
 */
export function useAiGenerator() {
  const theme = useTheme();
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  // Bottom-inset for the scroll's paddingBottom so the last section
  // clears the bottom tab bar + OS gesture pill, AND so there's always
  // a few hundred extra px of scrollable room — the user reported the
  // page "feels stack[ed], can't scroll although it fits". A taller
  // contentContainer means the ScrollView is genuinely scrollable on
  // every screen size, not just the small ones.
  const insets = useSafeAreaInsets();

  const hydrated = useAIStore((s) => s.hydrated);
  const providerId = useAIStore((s) => s.providerId);
  const history = useAIStore((s) => s.history);
  const todayCount = useAIStore((s) => s.todayCount);

  const provider = useMemo(() => getProvider(providerId), [providerId]);

  // "Retry with this prompt" from the preview screen forwards the prompt
  // via a router param. Read it here and seed the input once (AI-2) —
  // previously the param was sent but never consumed, so retry landed
  // on an empty box.
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string }>();

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [busy, setBusy] = useState(false);
  // Content-moderation verdict for the last blocked prompt. Non-null drives
  // the animated <ModerationAlert>; cleared when the user dismisses it.
  const [moderation, setModeration] = useState<ModerationVerdict | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous in-flight guard (AI-1). `busy` is async React state, so
  // two taps in the same tick both pass `if (busy) return` before
  // `setBusy(true)` lands — firing two concurrent generations. This ref
  // flips synchronously so the second tap is rejected immediately.
  const inFlightRef = useRef(false);
  // Holds the `model_loading` auto-retry timer so we can clear it on
  // unmount and never stack overlapping retries (AI-6).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) hydrateAIStore();
  }, [hydrated]);

  // Seed the prompt box from the forwarded retry param, once, only when
  // it's a non-empty string (AI-2). We don't add `prompt` to the deps —
  // this is a one-shot seed on param arrival, not a two-way bind.
  useEffect(() => {
    if (typeof promptParam === 'string' && promptParam.length > 0) {
      setPrompt(promptParam);
    }
  }, [promptParam]);

  // Cancel any in-flight generation if the screen unmounts (e.g. user
  // switches tabs). Prevents the success path from trying to navigate
  // on a dead screen. Also clear any pending model_loading retry timer
  // (AI-6) so it can't fire the handler after the screen is gone.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const onSurpriseMe = useCallback(() => {
    const pick = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
    setPrompt(pick);
  }, []);

  const dismissModeration = useCallback(() => setModeration(null), []);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Release the synchronous in-flight guard (AI-1) so the user can
    // immediately fire a fresh generation after cancelling.
    inFlightRef.current = false;
    setBusy(false);
  }, []);

  // Long-press on a recent-generation thumb → confirm → delete.
  // Same delete pipeline as the preview screen's Discard button (the
  // `deleteGeneration` helper handles history + pool refs + cache
  // file together). The recent strip auto-updates because it reads
  // from `useAIStore(s => s.history)` — store change triggers
  // re-render.
  const onDeleteHistoryItem = useCallback((localUri: string) => {
    premiumAlert({
      title: 'Delete this image?',
      message:
        'Removes it from history, from any mood pool it was added to, and deletes the file.',
      icon: 'trash-outline',
      accentColor: Colors.error,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            void deleteGeneration(localUri).then((r) => {
              if (r.removedFromPools > 0) {
                toast(
                  `Deleted · also removed from ${r.removedFromPools} pool${
                    r.removedFromPools === 1 ? '' : 's'
                  }`,
                );
              } else {
                toast('Deleted');
              }
            });
          },
        },
      ],
    });
  }, []);

  const onOpenHistoryItem = useCallback(
    (g: AIGeneration) =>
      router.push({
        pathname: '/ai/preview',
        params: {
          uri: g.localUri,
          prompt: g.prompt,
          model: g.model,
          // Use the persisted timing (AI-7); older
          // history entries without it fall back to 0,
          // which the preview renders as "no timing".
          durationMs: String(g.durationMs ?? 0),
          // No `fresh` flag — re-opens must not re-save
          // (AI-4).
        },
      }),
    [router],
  );

  const onGenerate = useCallback(() => {
    requireAuth(
      async () => {
        // Synchronous in-flight guard (AI-1) — must be the very first
        // thing in the async body so two taps in the same tick can't
        // both get past it. The old `if (busy) return` check raced
        // because `setBusy(true)` lands async; this ref flips
        // synchronously. Cleared in the `finally` and in `onCancel`.
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          // Pre-flight: provider needs a token. Surface the Settings
          // shortcut so the user can paste their HF token without
          // hunting through the tree.
          if (!provider.isConfigured()) {
            premiumAlert({
              title: 'Add your AI token',
              message:
                `${provider.displayName} needs an API token before it can generate. Open Settings → AI to paste yours.`,
              icon: 'key-outline',
              buttons: [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => router.push('/(tabs)/profile' as Href),
                },
              ],
            });
            return;
          }
          const trimmed = prompt.trim();
          if (!trimmed) {
            toast('Type a prompt first');
            return;
          }

          // Content gate (change 172): screen the prompt against the
          // prohibited-content rules BEFORE spending a generation, hitting
          // the network, or charging the daily quota. A blocked prompt
          // surfaces the animated <ModerationAlert> and bails.
          const verdict = moderatePrompt(trimmed);
          if (!verdict.allowed) {
            if (__DEV__) {
              console.warn('[ai/moderation] blocked:', verdict.category, verdict.matchedTerm);
            }
            setModeration(verdict);
            return;
          }

          const ctrl = new AbortController();
          abortRef.current = ctrl;
          setBusy(true);
          const r = await generateImage({ prompt: trimmed, aspect }, ctrl.signal);
          // If the user cancelled, the abort path (onCancel) already
          // reset busy/guard; bail without touching state. busy/abortRef
          // are reset in the finally regardless (AI-5).
          if (ctrl.signal.aborted) return;

          if (r.ok) {
            // Route to preview — the URI doubles as the preview's
            // identifier so a refresh / back-and-forward keeps working.
            // `fresh: '1'` marks this as a brand-new generation so the
            // preview auto-saves it exactly once (AI-4) — re-opens from
            // the recent strip omit the flag.
            router.push({
              pathname: '/ai/preview',
              params: {
                uri: r.localUri,
                prompt: trimmed,
                model: r.model,
                durationMs: String(r.durationMs),
                fresh: '1',
              },
            });
          } else {
            // model_loading is the most common first-call error — give
            // the user a one-tap retry rather than a flat toast.
            if (r.reason === 'model_loading' && r.retryAfterMs) {
              premiumAlert({
                title: 'Model is waking up',
                message: r.message,
                icon: 'time-outline',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: `Retry in ${Math.ceil(r.retryAfterMs / 1000)}s`,
                    onPress: () => {
                      // Store the timer so unmount can cancel it, and
                      // clear any prior one so retries never stack (AI-6).
                      // The retry re-enters onGenerate, which re-checks
                      // the in-flight guard (already released by the
                      // finally that ran when this invocation returned).
                      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                      retryTimerRef.current = setTimeout(() => {
                        retryTimerRef.current = null;
                        onGenerate();
                      }, r.retryAfterMs);
                    },
                  },
                ],
              });
              return;
            }
            if (r.reason === 'auth_missing' || r.reason === 'auth_invalid') {
              // 403 / 401 alerts cover three real-world causes (per
              // changes/066): (a) token missing the "Inference Providers"
              // permission, (b) gated model, (c) out of credits. Cases
              // (a) and (b) need the user to fix something on
              // huggingface.co — NOT in our app's Settings. So we now
              // offer two distinct buttons:
              //   - "Edit at HF" → browser link to the relevant HF page
              //   - "Open Settings" → app Settings (for case c: paste
              //                       a different token)
              // The HF target URL is picked off the message text — if
              // we mentioned a specific model page, link there; else
              // the tokens dashboard.
              const modelMentioned = /huggingface\.co\/([^\s)]+)/i.exec(r.message);
              const hfUrl = modelMentioned
                ? `https://huggingface.co/${modelMentioned[1].replace(/[).,]+$/, '')}`
                : 'https://huggingface.co/settings/tokens';
              premiumAlert({
                title: 'Token issue',
                message: r.message,
                icon: 'key-outline',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Edit at HF',
                    onPress: () => {
                      void Linking.openURL(hfUrl).catch(() => {
                        toast('Couldn’t open the browser');
                      });
                    },
                  },
                  {
                    text: 'Open Settings',
                    onPress: () => router.push('/(tabs)/profile' as Href),
                  },
                ],
              });
              return;
            }
            toast(r.message);
          }
        } finally {
          // Reset transient UI state on EVERY exit path (AI-1 + AI-5):
          // success push, validation bail, error alert, or an abort
          // racing the provider resolution. Putting it here means the
          // Generate button can never get stuck on "Cancel" and a fresh
          // tap is always accepted.
          inFlightRef.current = false;
          abortRef.current = null;
          setBusy(false);
        }
      },
      {
        title: 'Sign in to generate',
        message: 'AI generations are linked to your account so we can track your daily quota.',
      },
    );
  }, [aspect, prompt, provider, requireAuth, router]);

  return {
    theme,
    router,
    insets,
    history,
    todayCount,
    provider,
    prompt,
    setPrompt,
    aspect,
    setAspect,
    busy,
    moderation,
    dismissModeration,
    onSurpriseMe,
    onCancel,
    onDeleteHistoryItem,
    onOpenHistoryItem,
    onGenerate,
  };
}
