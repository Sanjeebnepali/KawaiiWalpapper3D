/**
 * Blob→base64 decoding for the Hugging Face provider. Extracted from
 * `huggingface.ts`; kept provider-local (a copy also lives in
 * `pollinations.io.ts`) so each provider stays self-contained — lift to a
 * shared util only when a third provider needs it (rule of three).
 */

/** Read a Blob as base64. React Native's FileReader supports this via
 *  `readAsDataURL`, then we strip the leading `data:image/...;base64,`. */
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
