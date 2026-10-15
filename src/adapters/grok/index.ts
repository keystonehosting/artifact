import { BaseAdapter } from '../base';
import { GROK_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';

/** /c/<id>, or /project/<pid>?chat=<id>. */
export function grokChatId(url: URL): string | null {
  const m = /^\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  if (m) return m[1]!;
  return url.searchParams.get('chat');
}

export class GrokAdapter extends BaseAdapter {
  constructor(doc: Document = document) {
    super(
      {
        site: 'grok',
        chatIdFromUrl: grokChatId,
        dom: GROK_DOM,
        ...SELECTORS.grok,
        capabilities: {},
      },
      [],
      doc,
    );
  }
}
