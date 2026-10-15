// Worker that counts o200k_base tokens off the main thread. The 2.4 MB rank
// table loads only when the first count is requested.
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base';

export default defineUnlistedScript(() => {
  const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(v: unknown): void };
  scope.onmessage = (e: MessageEvent<{ id: number; texts: string[] }>) => {
    const { id, texts } = e.data;
    try {
      scope.postMessage({ id, counts: texts.map((t) => countTokens(t)) });
    } catch (err) {
      scope.postMessage({ id, error: (err as Error).message });
    }
  };
});
