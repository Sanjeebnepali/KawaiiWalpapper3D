/**
 * Low-level IO primitives used by the Pollinations generate loop: abortable
 * timing and blob→base64 decoding. Extracted from `pollinations.ts` so the
 * provider file stays focused on the request algorithm. All pure — no module
 * state, no app imports.
 */

export function makeAbortError(): Error {
  const e = new Error('Generation cancelled.');
  (e as { name?: string }).name = 'AbortError';
  return e;
}

/** Promise-based sleep that rejects with an AbortError if `signal` fires,
 *  so a user-initiated cancel during a backoff wait is honoured. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
      reject(makeAbortError());
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/** Read a Blob as base64 — same helper as in `huggingface.ts`.
 *  Duplicated on purpose so each provider stays self-contained; lift to a
 *  shared util only when a third provider needs it (rule of three). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
