// Page selectors per Tier 1 site. Sources and confirmation status for each
// are listed in docs/provider-notes.md; composer selectors derive from ACE
// content/transfer/platform-inputs.js (MPL-2.0).
export const SELECTORS = {
  chatgpt: {
    composer: [
      'div#prompt-textarea.ProseMirror[contenteditable="true"]',
      '#prompt-textarea[contenteditable="true"]',
      'div.ProseMirror[role="textbox"][contenteditable="true"]',
    ],
    send: ['button[data-testid="send-button"]', 'button#composer-submit-button'],
    streaming: 'button[data-testid="stop-button"]',
    sidebar: 'nav[aria-label="Chat history"], #history, nav',
    modelLabel: '[data-testid="model-switcher-dropdown-button"]',
  },
  claude: {
    composer: [
      'div[data-testid="chat-input"][contenteditable="true"]',
      'div.tiptap.ProseMirror[contenteditable="true"]',
    ],
    send: ['button[aria-label="Send message"]', 'button[data-testid="chat-input-send"]'],
    streaming: 'button[aria-label="Stop response"]',
    sidebar: 'nav[aria-label="Sidebar"], nav',
    modelLabel: '[data-testid="model-selector-dropdown"]',
  },
  gemini: {
    composer: [
      'rich-textarea div.ql-editor[contenteditable="true"]',
      'div.ql-editor[role="textbox"][contenteditable="true"]',
    ],
    send: ['button.send-button:not(.stop)', 'button[aria-label="Send message"]'],
    streaming: 'button.send-button.stop, button[aria-label="Stop response"]',
    sidebar: '[data-test-id="chat-history-container"], bard-sidenav, side-navigation-v2',
    modelLabel: '[data-test-id="bard-mode-menu-button"]',
  },
  aistudio: {
    composer: ['ms-prompt-input-wrapper textarea', 'ms-chunk-input textarea', 'footer textarea'],
    send: ['ms-run-button button', 'button[aria-label="Run"]'],
    streaming: 'ms-run-button button.stoppable, button[aria-label="Stop"]',
    sidebar: 'ms-navbar, nav',
    modelLabel: 'ms-model-selector .title, ms-model-selector',
  },
  grok: {
    composer: [
      'div[data-testid="chat-input"] [contenteditable="true"]',
      'div.query-bar-editor[contenteditable="true"]',
      'div.tiptap.ProseMirror[role="textbox"]',
      'form textarea',
    ],
    send: ['button[type="submit"][aria-label="Submit"]', 'form button[type="submit"]'],
    streaming: 'button[aria-label="Stop model response"]',
    sidebar: '[data-sidebar="sidebar"], nav',
    modelLabel: '#model-select-trigger',
  },
} as const;
