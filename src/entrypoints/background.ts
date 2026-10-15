// Background: context-menu actions. Later milestones add indexing, queues,
// alarms and backups here.
import { browser } from 'wxt/browser';
import { t } from '../core/i18n/t';
import { siteForUrl } from '../core/sites/sites';
import { buildDocument } from '../core/export/document';
import { toMarkdown } from '../core/export/markdown';
import { formatFilename } from '../core/util/filename';
import type { ContentRequests } from '../core/messaging/protocol';

const MENU_EXPORT_MD = 'artifact-export-md';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: MENU_EXPORT_MD,
        title: t('menu_export_markdown'),
        contexts: ['page'],
        documentUrlPatterns: [
          'https://chatgpt.com/*',
          'https://chat.openai.com/*',
          'https://claude.ai/*',
          'https://gemini.google.com/*',
          'https://aistudio.google.com/*',
          'https://grok.com/*',
        ],
      });
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== MENU_EXPORT_MD || tab?.id === undefined || !tab.url) return;
    const site = siteForUrl(tab.url);
    if (!site) return;
    const res = (await browser.tabs.sendMessage(tab.id, { type: 'content:read' })) as ContentRequests['content:read']['res'];
    if (!res?.conversation) return;
    const md = toMarkdown(buildDocument(res.conversation));
    const name = `${formatFilename(undefined, { platform: site.name, title: res.conversation.title })}.md`;
    const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
    await browser.downloads.download({ url, filename: name, conflictAction: 'uniquify' });
  });
});
