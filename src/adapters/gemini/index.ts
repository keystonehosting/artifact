import { BaseAdapter } from '../base';
import { GEMINI_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';

/** /app/<id> and /gem/<gemId>/<id>; ids are normalised to the c_ form the RPCs use. */
export function geminiChatId(url: URL): string | null {
  const m = /^\/(?:u\/\d+\/)?(?:app|gem\/[^/]+)\/([0-9a-z_]{8,})/i.exec(url.pathname);
  if (!m) return null;
  return m[1]!.startsWith('c_') ? m[1]! : `c_${m[1]}`;
}

export class GeminiAdapter extends BaseAdapter {
  constructor(doc: Document = document) {
    super(
      {
        site: 'gemini',
        chatIdFromUrl: geminiChatId,
        dom: GEMINI_DOM,
        ...SELECTORS.gemini,
        capabilities: {},
      },
      [],
      doc,
    );
  }
}
