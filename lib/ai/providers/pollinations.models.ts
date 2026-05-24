/**
 * Pollinations model catalog — the FLUX-family models the provider offers.
 * Extracted from `pollinations.ts` so the provider file stays focused on the
 * request algorithm; this file is pure data.
 */

export type PollModel = {
  id: string;
  displayName: string;
};

export const POLL_MODELS: PollModel[] = [
  { id: 'flux', displayName: 'FLUX · best quality' },
  { id: 'turbo', displayName: 'Turbo · fastest' },
  { id: 'flux-anime', displayName: 'FLUX Anime' },
  { id: 'flux-realism', displayName: 'FLUX Realism' },
  { id: 'flux-3d', displayName: 'FLUX 3D' },
];

export const DEFAULT_MODEL_ID = POLL_MODELS[0].id;
