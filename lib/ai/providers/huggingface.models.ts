/**
 * Supported HF text-to-image models. Each row provides the defaults the
 * provider should use when the user doesn't override them — different
 * models need WILDLY different `steps` and `guidanceScale` (FLUX-schnell:
 * 4 + 0, SDXL: 25 + 7.5). Hiding this complexity here keeps the UI
 * uniform across models. Extracted from `huggingface.ts` (pure data).
 */
import { DEFAULT_HF_MODEL } from '../defaults';

export type HFModel = {
  id: string;
  displayName: string;
  defaultSteps: number;
  defaultGuidance: number;
  /** Does this model accept `width` / `height` in its parameters? Some
   *  HF wrappers ignore them; documented here to avoid wasted bytes. */
  acceptsSize: boolean;
};

export const HF_MODELS: HFModel[] = [
  // ─── Reliably available on HF free serverless tier ─────────────────
  // These models DO work via the legacy `api-inference.huggingface.co`
  // endpoint with a plain Read token. Order here drives the dropdown
  // order in Settings.
  {
    id: 'stabilityai/stable-diffusion-xl-base-1.0',
    displayName: 'Stable Diffusion XL · default',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  {
    id: 'runwayml/stable-diffusion-v1-5',
    displayName: 'Stable Diffusion 1.5 · fastest',
    defaultSteps: 20,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  {
    id: 'stabilityai/stable-diffusion-2-1',
    displayName: 'Stable Diffusion 2.1',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  // ─── Premium / Inference Providers — may 404 on free tier ──────────
  // FLUX-schnell was pulled from HF's free serverless API in late 2024
  // and now routes through paid "Inference Providers." Listed here so
  // users with credits / paid plans can still pick it, but the default
  // (`DEFAULT_HF_MODEL`) lives above to keep new installs working out
  // of the box. The 404 reason mapping in `generateImage` below
  // surfaces a clear "needs paid plan" message when a free user hits
  // this model.
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    displayName: 'FLUX.1-schnell · needs paid plan',
    defaultSteps: 4,
    defaultGuidance: 0,
    acceptsSize: true,
  },
];

export const FALLBACK_MODEL_ID = DEFAULT_HF_MODEL;
