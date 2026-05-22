import { useCallback, useState } from 'react';

/**
 * Multi-select filter state for the search screen's category chips.
 *
 * `selected` is the list of active chip values; an empty list means
 * "no filter" (show everything). Pair with `searchWallpapers()` from
 * `constants/mockData`.
 */
export function useFilter(initial: string[] = []) {
  const [selected, setSelected] = useState<string[]>(initial);

  const toggle = useCallback((value: string) => {
    setSelected((cur) =>
      cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
    );
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const isActive = useCallback(
    (value: string) => selected.includes(value),
    [selected],
  );

  return { selected, toggle, clear, isActive, count: selected.length };
}
