import { useCallback, useMemo, useState } from 'react';
import {
  getCategoryPhotos,
  type CategoryId,
  type CategoryPhoto,
} from '../constants/mockData';

type FetchState = {
  wallpapers: CategoryPhoto[];
  loading: boolean;
  error: string | null;
};

/**
 * Loads wallpapers for a category from local mock data.
 *
 * The data source is synchronous, so the result is derived with `useMemo` —
 * the screen gets its data on the very first render with no `loading: true`
 * spinner flash (this was the visible 2–3s "pause" on tab switch, Task 3).
 *
 * The `{ loading, error, refetch }` shape is kept as the seam for a future
 * remote API: only this hook's body would change, not any call site. `refetch`
 * bumps a nonce to force a fresh memo pass.
 */
export function useFetchWallpapers(categoryId: CategoryId, count = 30) {
  const [nonce, setNonce] = useState(0);

  const state = useMemo<FetchState>(() => {
    try {
      return {
        wallpapers: getCategoryPhotos(categoryId, count),
        loading: false,
        error: null,
      };
    } catch (e) {
      return {
        wallpapers: [],
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load wallpapers',
      };
    }
    // `nonce` is an intentional dependency — it's how `refetch` re-runs this.
  }, [categoryId, count, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, refetch };
}
