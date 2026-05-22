import { useShuffleEngineHost } from '../hooks/useShuffleEngine';

/**
 * Headless mount point for the foreground shuffle ticker. Place once at
 * the app root so the engine keeps advancing while the user navigates
 * around (previously it only ran while `app/shuffle/active.tsx` was
 * mounted, which made the auto-change feel broken — see changes/024).
 */
export function ShuffleEngineHost() {
  useShuffleEngineHost();
  return null;
}
