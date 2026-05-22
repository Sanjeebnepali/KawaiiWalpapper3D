import { useEffect, useState } from 'react';

/**
 * Returns `false` on the first render, then `true` after two animation
 * frames — i.e. after the destination screen has been mounted, laid out,
 * and the stack push animation has had a chance to start.
 *
 * **Why two frames?** One RAF defers past the current paint. Two RAFs
 * defer past the NEXT paint as well, which is when react-native-screens
 * actually starts the slide-in. Mounting the heavy grid in the third
 * frame means the JS thread is free for the animation's first ~16 ms.
 *
 * **Why not `InteractionManager.runAfterInteractions`?** RN deprecated it
 * in 0.78+. The replacement is RAF or the experimental
 * `requestIdleCallback` (not universally available). Two RAFs is the
 * portable, deterministic equivalent.
 *
 * Usage:
 *
 * ```tsx
 * const ready = useDeferredMount();
 * return (
 *   <SafeAreaView>
 *     <Header />
 *     {ready ? <FlatList ... /> : null}
 *   </SafeAreaView>
 * );
 * ```
 */
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return;
      // Wait one more frame — the first RAF fires right before the next
      // paint; we want to be AFTER it (and the native push to be in flight).
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
  }, []);
  return ready;
}
