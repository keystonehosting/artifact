import { BaseAdapter } from '../base';
import { AISTUDIO_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';

export function aistudioChatId(url: URL): string | null {
  const m = /^\/(?:u\/\d+\/)?prompts\/([\w-]+)/.exec(url.pathname);
  if (!m || m[1] === 'new_chat') return null;
  return m[1]!;
}

export class AIStudioAdapter extends BaseAdapter {
  constructor(doc: Document = document) {
    super(
      {
        site: 'aistudio',
        chatIdFromUrl: aistudioChatId,
        dom: AISTUDIO_DOM,
        ...SELECTORS.aistudio,
        capabilities: {},
      },
      [],
      doc,
    );
  }
}
