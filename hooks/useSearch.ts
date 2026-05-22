import { useCallback, useEffect, useState } from 'react';

/**
 * Controlled search-input state with a small debounce on the *committed*
 * query, so result filtering doesn't run on every keystroke.
 *
 * `query` drives the TextInput (instant); `debounced` drives the results.
 */
export function useSearch(initial = '', delay = 200) {
  const [query, setQuery] = useState(initial);
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), delay);
    return () => clearTimeout(t);
  }, [query, delay]);

  const clear = useCallback(() => {
    setQuery('');
    setDebounced('');
  }, []);

  return { query, setQuery, debounced, clear };
}
