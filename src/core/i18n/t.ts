// i18n through the browser's _locales so translations are plain pull requests.
// Falls back to the key when a message is missing (tests, unpacked dev builds).
export function t(key: string, subs?: string | string[]): string {
  try {
    const g = globalThis as { chrome?: { i18n?: { getMessage(k: string, s?: string | string[]): string } } };
    const msg = g.chrome?.i18n?.getMessage(key, subs);
    if (msg) return msg;
  } catch {
    // not in an extension context
  }
  return key;
}
