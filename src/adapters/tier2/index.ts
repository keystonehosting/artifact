// Tier 2 adapters (SPEC §2): page reading, composer insertion and health, no
// site endpoints. Selectors come from the clean-room dossier
// (docs/dossier/my-prompt/README.md), unconfirmed live, and are listed in
// docs/provider-notes.md. Sites without known message selectors read nothing
// and say so in their health, rather than guessing.
import { BaseAdapter, DOM_CHECK, defaultContext, type BaseConfig, type SiteContext } from '../base';
import type { DomReaderConfig } from '../dom-reader';
import type { Read } from '../types';
import type { Conversation, Role } from '../../core/schema/archive';
import { SITES, type Tier2SiteId } from '../../core/sites/sites';
import { cleanPageTitle } from '../../core/util/filename';
import { GENERIC_COMPOSER_SELECTORS } from '../../core/dom/composer';
import { tier2ChatId } from '../../core/sites/chat-urls';

/** Matches no element: used where no message selectors are known. */
const NONE = ':not(*)';

interface Tier2Spec {
  user: string | null;
  userText?: string;
  assistant: string | null;
  assistantText?: string;
  composer: readonly string[];
  send: readonly string[];
  sidebar?: string;
}

const SPECS: Record<Tier2SiteId, Tier2Spec> = {
  perplexity: {
    user: 'div.group\\/user-bubble',
    userText: 'div.bg-subtle span.whitespace-pre-line',
    assistant: 'div[data-workflow-final-text]',
    assistantText: 'div.prose[data-renderer="lm"]',
    composer: ['#ask-input'],
    send: ['button.bg-button-bg'],
  },
  deepseek: {
    user: '.ds-message:not(:has(.ds-markdown)) > div:first-child',
    assistant: '.ds-message:has(.ds-markdown)',
    assistantText: '.ds-markdown',
    composer: ['textarea.ds-scroll-area'],
    send: [],
  },
  mistral: {
    user: 'div[data-message-author-role="user"] .rounded-3xl',
    userText: '.select-text span',
    assistant: 'div:has(>[data-testid="text-message-part"])',
    assistantText: '[data-testid="text-message-part"]',
    composer: ['div.ProseMirror[contenteditable="true"]'],
    send: [],
  },
  kimi: {
    user: '.chat-content-item-user .segment-content',
    userText: '.user-content',
    assistant: '.segment-assistant .segment-content-box',
    assistantText: '.markdown',
    composer: ['div.chat-input-editor[contenteditable="true"]'],
    send: [],
  },
  poe: {
    user: '.Message_rightSideMessageBubble__ioa_i',
    userText: '.Message_selectableText__SQ8WH',
    assistant: '.Message_leftSideMessageBubble__VPdk6',
    assistantText: '.Message_selectableText__SQ8WH',
    composer: ['textarea[class*="GrowingTextArea_textArea"]'],
    send: ['button[data-button-send="true"]'],
  },
  copilot: {
    user: 'div:has(> div[data-content="user-message"])',
    userText: 'div[data-content="user-message"]',
    assistant: 'div[data-testid="ai-message"]',
    assistantText: 'div[id*="-content-"]',
    composer: ['#userInput', 'textarea[data-testid="composer-input"]'],
    send: ['button[data-testid="submit-button"]'],
  },
  ghcopilot: { user: null, assistant: null, composer: GENERIC_COMPOSER_SELECTORS, send: [] },
  aimode: { user: null, assistant: null, composer: ['textarea.ITIRGe'], send: ['button[data-xid="input-plate-send-button"]'] },
};

export function tier2Dom(site: Tier2SiteId): DomReaderConfig {
  const s = SPECS[site];
  const name = SITES[site].name;
  const turns = [s.user, s.assistant].filter(Boolean).join(', ') || NONE;
  return {
    site,
    turns,
    role: (el): Role | null => (s.user && el.matches(s.user) ? 'user' : s.assistant && el.matches(s.assistant) ? 'assistant' : null),
    content: (el, role) => {
      const sel = role === 'user' ? s.userText : s.assistantText;
      return (sel && el.querySelector(sel)) || el;
    },
    title: (doc) => cleanPageTitle(doc.title, name) || `${name} conversation`,
  };
}

export class Tier2Adapter extends BaseAdapter {
  private readonly reads: boolean;

  constructor(site: Tier2SiteId, ctx: SiteContext = defaultContext()) {
    const s = SPECS[site];
    const cfg: BaseConfig = {
      site,
      chatIdFromUrl: (url) => tier2ChatId(site, url),
      dom: tier2Dom(site),
      composer: s.composer,
      send: s.send,
      streaming: NONE,
      sidebar: s.sidebar ?? 'nav',
      capabilities: { fillComposer: true },
    };
    super(cfg, [DOM_CHECK], ctx);
    this.reads = !!(s.user || s.assistant);
  }

  override async readConversation(): Promise<Read<Conversation> | null> {
    if (!this.reads) {
      this.tracker.fail(DOM_CHECK, `Reading messages on ${SITES[this.id].name} isn't available yet: no confirmed page selectors`);
      return null;
    }
    return super.readConversation();
  }
}
