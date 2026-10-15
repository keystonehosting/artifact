// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tier2Dom } from '../../src/adapters/tier2';
import { readDomConversation } from '../../src/adapters/dom-reader';
import { tier2ChatId, libraryIdForUrl } from '../../src/core/sites/chat-urls';
import { TIER2_SITES, type Tier2SiteId } from '../../src/core/sites/sites';
import { messageText, activeBranch } from '../../src/core/model/tree';

// Synthetic pages shaped like the selectors in the clean-room dossier
// (unconfirmed live). Text is lorem ipsum.
const PAGES: Partial<Record<Tier2SiteId, string>> = {
  perplexity: `<div class="group/user-bubble"><div class="bg-subtle"><span class="whitespace-pre-line">Lorem question?</span></div></div>
    <div data-workflow-final-text><div class="prose" data-renderer="lm"><p>Ipsum answer.</p></div><button>Share</button></div>`,
  deepseek: `<div class="ds-message"><div>Lorem question?</div></div><div class="ds-message"><div class="ds-markdown"><p>Ipsum answer.</p></div></div>`,
  mistral: `<div data-message-author-role="user"><div class="rounded-3xl"><div class="select-text"><span>Lorem question?</span></div></div></div>
    <div><div data-testid="text-message-part"><p>Ipsum answer.</p></div></div>`,
  kimi: `<div class="chat-content-item-user"><div class="segment-content"><div class="user-content">Lorem question?</div></div></div>
    <div class="segment-assistant"><div class="segment-content-box"><div class="markdown"><p>Ipsum answer.</p></div></div></div>`,
  poe: `<div class="Message_rightSideMessageBubble__ioa_i"><div class="Message_selectableText__SQ8WH"><p>Lorem question?</p></div></div>
    <div class="Message_leftSideMessageBubble__VPdk6"><div class="Message_selectableText__SQ8WH"><p>Ipsum answer.</p></div></div>`,
  copilot: `<div><div data-content="user-message">Lorem question?</div></div><div data-testid="ai-message"><div id="m1-content-0"><p>Ipsum answer.</p></div></div>`,
};

describe('tier 2 page reading', () => {
  for (const [site, html] of Object.entries(PAGES) as Array<[Tier2SiteId, string]>) {
    it(`reads ${site}`, () => {
      document.body.innerHTML = html;
      const conv = readDomConversation(document, tier2Dom(site), 'x', 'https://example.test/x');
      expect(conv).not.toBeNull();
      const msgs = activeBranch(conv!);
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(messageText(msgs[0]!)).toContain('Lorem question?');
      expect(messageText(msgs[1]!)).toContain('Ipsum answer.');
      expect(conv!.source.approximate).toBe(true);
    });
  }

  it('sites without known selectors read nothing', () => {
    document.body.innerHTML = '<main><p>Something</p></main>';
    expect(readDomConversation(document, tier2Dom('ghcopilot'), 'x', 'https://github.com/copilot/c/x')).toBeNull();
    expect(readDomConversation(document, tier2Dom('aimode'), 'x', 'https://www.google.com/search?udm=50')).toBeNull();
  });
});

describe('tier 2 chat ids', () => {
  it('uses the page path, and none on the new-chat page', () => {
    expect(tier2ChatId('perplexity', new URL('https://www.perplexity.ai/search/lorem-abc'))).toBe('search/lorem-abc');
    expect(tier2ChatId('perplexity', new URL('https://www.perplexity.ai/'))).toBeNull();
    expect(tier2ChatId('mistral', new URL('https://chat.mistral.ai/chat'))).toBeNull();
    expect(tier2ChatId('mistral', new URL('https://chat.mistral.ai/chat/123'))).toBe('chat/123');
    expect(tier2ChatId('ghcopilot', new URL('https://github.com/copilot/c/abc'))).toBe('c/abc');
    expect(tier2ChatId('ghcopilot', new URL('https://github.com/copilot'))).toBeNull();
    expect(tier2ChatId('aimode', new URL('https://www.google.com/search?udm=50&q=x'))).toBeNull();
    expect(libraryIdForUrl('https://chat.deepseek.com/a/chat/s/xyz')).toBe('deepseek:a/chat/s/xyz');
    expect(TIER2_SITES).toHaveLength(8);
  });
});
