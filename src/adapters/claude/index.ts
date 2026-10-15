import { BaseAdapter } from '../base';
import { CLAUDE_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';

export function claudeChatId(url: URL): string | null {
  const m = /^\/chat\/([0-9a-f-]{36})/i.exec(url.pathname);
  return m ? m[1]! : null;
}

export class ClaudeAdapter extends BaseAdapter {
  constructor(doc: Document = document) {
    super(
      {
        site: 'claude',
        chatIdFromUrl: claudeChatId,
        dom: CLAUDE_DOM,
        ...SELECTORS.claude,
        capabilities: {},
      },
      [],
      doc,
    );
  }
}
