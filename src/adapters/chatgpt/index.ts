import { BaseAdapter } from '../base';
import { CHATGPT_DOM } from '../tier1-dom';
import { SELECTORS } from '../selectors';

export function chatgptChatId(url: URL): string | null {
  const m = /\/c\/([0-9a-f-]{8,})/i.exec(url.pathname);
  return m ? m[1]! : null;
}

export class ChatGPTAdapter extends BaseAdapter {
  constructor(doc: Document = document) {
    super(
      {
        site: 'chatgpt',
        chatIdFromUrl: chatgptChatId,
        dom: CHATGPT_DOM,
        ...SELECTORS.chatgpt,
        capabilities: {},
      },
      [],
      doc,
    );
  }
}
