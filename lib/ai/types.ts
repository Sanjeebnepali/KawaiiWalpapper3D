/**
 * AI image generation — provider abstraction.
 *
 * The contract every provider in `lib/ai/providers/*` implements. The UI
 * (`app/(tabs)/ai.tsx`) and the public `generateImage` entry point in
 * `lib/ai/client.ts` only ever talk to this interface, never to a concrete
 * provider directly. Adding a new provider (DALL-E, Stability, Replicate,
 * Midjourney) means:
 *
 *   1. New file `lib/ai/providers/<name>.ts` exporting an `AIProvider`.
 *   2. One row in `lib/ai/registry.ts`.
 *   3. Optional: one premium-tier flag in `store/ai.ts` if the new
 *      provider should gate behind a paid subscription.
 *
 * Zero changes to the screen, the client, or any existing provider.
 * The whole point of this file.
 */

export type AIProviderId =
  /** Free / no-token. Pollinations.ai — the new default. Backs FLUX
   *  for free, no signup, no credits. */
  | 'pollinations'
  /** Token-required. Hugging Face Inference Providers. Works only
   *  with paid PRO or pay-as-you-go credits + Fine-grained token
   *  with the "Make calls to Inference Providers" permission. */
  | 'huggingface'
  /** OpenAI DALL·E 3 via the official Images API. User pastes their own
   *  OpenAI key; usage is billed by OpenAI to that key. */
  | 'dalle'
  /** Google Gemini (Imagen) via the Generative Language API. User pastes
   *  their own Google API key; usage is billed by Google to that key. */
  | 'gemini'
  /** Reserved — premium. Stability AI's REST API. */
  | 'stability'
  /** Reserved — premium. Replicate hosted models. */
  | 'replicate';

/** Aspect-ratio presets — the UI exposes these as chips so the user
 *  doesn't have to type pixel sizes. Wallpapers are typically 9:16. */
export type AspectRatio = '1:1' | '9:16' | '16:9' | '3:4' | '4:3';

export interface ImageGenRequest {
  /** Text prompt. Required. */
  prompt: string;
  /** Optional negative prompt — "do NOT include these things." */
  negativePrompt?: string;
  /** Aspect ratio preset. Default `'9:16'` for wallpapers. */
  aspect?: AspectRatio;
  /** Random seed for reproducibility. Optional; provider defaults if absent. */
  seed?: number;
  /** Number of diffusion steps. Provider-specific defaults — FLUX-schnell
   *  is happy at 4, SDXL wants 25–30. The client will pass a sane default
   *  if you omit this. */
  steps?: number;
  /** Classifier-free guidance scale. FLUX-schnell uses 0 (distillation),
   *  SDXL uses 7.5. Provider default is used if absent. */
  guidanceScale?: number;
  /** Free-form passthrough for provider-specific knobs. Avoid using this
   *  unless the standard fields above can't express what you need —
   *  anything that goes here can't be UI-controlled portably across
   *  providers. */
  extra?: Record<string, unknown>;
}

export interface ImageGenSuccess {
  ok: true;
  /** Local `file://` URI of the saved image (cache dir). Ready to feed
   *  into `expo-image`, `setAsWallpaper`, `MediaLibrary`, etc. */
  localUri: string;
  /** Wall-clock duration of the request (ms). */
  durationMs: number;
  /** Which provider id served the request (the active id at call time). */
  provider: AIProviderId;
  /** Which model id the provider used (e.g.
   *  `'black-forest-labs/FLUX.1-schnell'`). Surfaced in the preview
   *  screen so users can compare models. */
  model: string;
  /** Width / height in px of the returned image. Useful for preview
   *  layout and "what aspect did I actually get back" verification. */
  width?: number;
  height?: number;
}

export type ImageGenErrorReason =
  /** No API token configured for the active provider. UI should send
   *  the user to Settings. */
  | 'auth_missing'
  /** Token rejected by the provider (401 / 403). Wrong / revoked. */
  | 'auth_invalid'
  /** HF cold-start: model is loading, retry after `retryAfterMs`. */
  | 'model_loading'
  /** Free-tier rate limit (429) or daily quota. */
  | 'rate_limited'
  /** Prompt rejected by the provider's safety filter. */
  | 'safety_filter'
  /** Prompt failed validation (empty / too long). */
  | 'invalid_prompt'
  /** User cancelled the request via the AbortSignal. */
  | 'cancelled'
  /** Generic network failure (offline, DNS, TLS, etc.). */
  | 'network'
  /** Anything else — provider returned 5xx, malformed body, etc. */
  | 'unknown';

export interface ImageGenError {
  ok: false;
  reason: ImageGenErrorReason;
  /** Human-readable message — safe to toast directly. */
  message: string;
  /** For `model_loading` and `rate_limited` — when to retry, in ms.
   *  Undefined means "don't retry automatically." */
  retryAfterMs?: number;
}

export type ImageGenResult = ImageGenSuccess | ImageGenError;

export interface AIProvider {
  /** Stable id — matches the entry in `registry.ts`. */
  id: AIProviderId;
  /** What the UI displays to the user. */
  displayName: string;
  /** Marketing-y subtitle the dropdown chip can show. */
  description: string;
  /** Whether the provider requires a paid subscription on OUR side
   *  (not on the provider's side). `false` for HF (free), `true` for
   *  DALL-E etc. when we add them. */
  isPremium: boolean;
  /** True iff the provider has all the config it needs to make a
   *  call right now — typically: a non-empty API token. The UI uses
   *  this to grey out the Generate button and prompt the user to
   *  paste a token. */
  isConfigured: () => boolean;
  /** Default model id for this provider. The UI surfaces this as the
   *  current model under the provider name. */
  defaultModel: string;
  /** Optional model picker — if more than one is meaningful for the
   *  provider, list them here so the UI can offer a dropdown. */
  availableModels?: Array<{ id: string; displayName: string }>;
  /**
   * Fire a generation request.
   *
   * Implementations MUST:
   *   - Honour `signal` (AbortController) so the UI can cancel a slow
   *     request.
   *   - Return `ImageGenError` instead of throwing on every known
   *     failure mode (auth, rate limit, model loading, network).
   *     Throwing should be reserved for genuinely-unexpected bugs.
   *   - Save the image to `FileSystem.cacheDirectory` and return the
   *     local `file://` URI in `localUri`. The caller must NOT see
   *     base64 / blob — those are 3x more memory than the on-disk URI.
   */
  generateImage: (
    req: ImageGenRequest,
    signal?: AbortSignal,
  ) => Promise<ImageGenResult>;
}

/** UI-only — translate aspect string into pixel size. Providers may
 *  override (e.g., FLUX likes multiples of 16). */
export function aspectToSize(aspect: AspectRatio): { width: number; height: number } {
  switch (aspect) {
    case '1:1':
      return { width: 1024, height: 1024 };
    case '9:16':
      return { width: 768, height: 1344 };
    case '16:9':
      return { width: 1344, height: 768 };
    case '3:4':
      return { width: 896, height: 1152 };
    case '4:3':
      return { width: 1152, height: 896 };
  }
}
