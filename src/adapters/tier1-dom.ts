// DOM-fallback configurations for the Tier 1 sites. Selectors were observed in
// the page captures under tests/fixtures (from ACE) and are listed with their
// status in docs/provider-notes.md. They are the last resort after intercepted
// and endpoint data.
import type { DomReaderConfig } from './dom-reader';
import { textOf } from './dom-reader';
import { cleanPageTitle } from '../core/util/filename';

const pageTitle = (site: string) => (doc: Document) => cleanPageTitle(doc.title, site) || `${site} conversation`;

export const CHATGPT_DOM: DomReaderConfig = {
  site: 'chatgpt',
  turns: '[data-message-author-role]',
  role: (el) => {
    const r = el.getAttribute('data-message-author-role');
    return r === 'user' || r === 'assistant' || r === 'system' || r === 'tool' ? r : null;
  },
  content: (el, role) =>
    role === 'user' ? (el.querySelector('.whitespace-pre-wrap') ?? el) : (el.querySelector('.markdown') ?? el),
  id: (el) => el.getAttribute('data-message-id'),
  model: (el) => el.getAttribute('data-message-model-slug'),
  title: pageTitle('ChatGPT'),
};

export const CLAUDE_DOM: DomReaderConfig = {
  site: 'claude',
  turns: '[data-testid="user-message"], .font-claude-response',
  role: (el) => (el.matches('[data-testid="user-message"]') ? 'user' : 'assistant'),
  content: (el, role) => (role === 'assistant' ? (el.querySelector('.standard-markdown') ?? el) : el),
  title: (doc) => textOf(doc.querySelector('[data-testid="chat-title-button"] .truncate, [data-testid="chat-menu-trigger"]')) || pageTitle('Claude')(doc),
};

export const GEMINI_DOM: DomReaderConfig = {
  site: 'gemini',
  turns: 'user-query, model-response',
  role: (el) => (el.tagName === 'USER-QUERY' ? 'user' : 'assistant'),
  content: (el, role) =>
    role === 'user'
      ? (el.querySelector('.query-text') ?? el)
      : (el.querySelector('message-content .markdown') ?? el.querySelector('message-content') ?? el),
  skip: '.cdk-visually-hidden, .query-text-line-placeholder',
  title: (doc) =>
    textOf(doc.querySelector('[data-test-id="conversation-title"], .conversation-title')) || pageTitle('Gemini')(doc),
};

export const AISTUDIO_DOM: DomReaderConfig = {
  site: 'aistudio',
  turns: 'ms-chat-turn',
  role: (el) => {
    const r = (el.querySelector('[data-turn-role]')?.getAttribute('data-turn-role') ?? '').toLowerCase();
    if (r === 'user') return 'user';
    if (r === 'model') return 'assistant';
    const container = el.querySelector('.chat-turn-container');
    if (container?.classList.contains('user')) return 'user';
    if (container?.classList.contains('model')) return 'assistant';
    if (el.querySelector('.user-prompt')) return 'user';
    return 'assistant';
  },
  content: (el) =>
    el.querySelector('.turn-content') ?? el.querySelector('.model-response-text, .prompt-text') ?? el,
  skip: 'ms-thought-chunk, .actions-container, .turn-footer',
  title: (doc) =>
    (doc.querySelector('h1.mode-title, .page-title h1, input.prompt-title') as HTMLInputElement | null)?.value ||
    textOf(doc.querySelector('h1.mode-title, .page-title h1')) ||
    pageTitle('Google AI Studio')(doc),
};

export const GROK_DOM: DomReaderConfig = {
  site: 'grok',
  turns: '[data-testid="user-message"], [data-testid="assistant-message"]',
  role: (el) => (el.getAttribute('data-testid') === 'user-message' ? 'user' : 'assistant'),
  id: (el) => el.closest('[id^="response-"]')?.id.slice('response-'.length) ?? null,
  skip: '.thinking-container',
  title: pageTitle('Grok'),
};

export const TIER1_DOM = {
  chatgpt: CHATGPT_DOM,
  claude: CLAUDE_DOM,
  gemini: GEMINI_DOM,
  aistudio: AISTUDIO_DOM,
  grok: GROK_DOM,
} as const;
