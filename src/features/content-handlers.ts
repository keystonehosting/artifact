// Handlers for messages sent to the content script. Every account-changing
// action (delete, archive, rename) only runs on an explicit request from an
// extension page, where the destructive-action guardrails apply first.
import type { SiteInfo } from '../core/sites/sites';
import type { SiteAdapter } from '../adapters/types';
import type { ContentMessage, ContentRequests } from '../core/messaging/protocol';
import { bytesToBase64 } from '../core/util/bytes';

type Handlers = { [K in keyof ContentRequests]: (msg: Extract<ContentMessage, { type: K }>) => Promise<ContentRequests[K]['res']> };

function need<T>(fn: T | undefined, what: string): T {
  if (!fn) throw new Error(`${what} is not supported on this site`);
  return fn;
}

export function contentHandlers(site: SiteInfo, adapter: SiteAdapter): Handlers {
  return {
    'content:ping': async () => ({ site: site.id, chatId: adapter.detectConversation(), capabilities: adapter.capabilities }),
    'content:read': async () => {
      try {
        const read = await adapter.readConversation();
        return { conversation: read?.value ?? null, health: adapter.health() };
      } catch (e) {
        return { conversation: null, health: adapter.health(), error: (e as Error).message };
      }
    },
    'content:get-chat': async (m) => ({ conversation: (await need(adapter.getChat, 'Reading other chats').call(adapter, m.chatId)).value }),
    'content:selftest': async () => ({ site: site.id, health: await adapter.selfTest(), url: location.href }),
    'content:fill': async (m) => {
      const ok = await adapter.fillComposer(m.text);
      if (ok && m.submit) await adapter.submit();
      return { ok };
    },
    'content:model': async () => adapter.getModel(),
    'content:usage': async () => ({ usage: adapter.getUsage ? await adapter.getUsage() : null }),
    'content:list-chats': async (m) => need(adapter.listChats, 'Listing chats').call(adapter, m.cursor),
    'content:projects': async () => ({ projects: await need(adapter.listProjects, 'Projects').call(adapter) }),
    'content:project': async (m) => ({ project: await need(adapter.getProject, 'Project details').call(adapter, m.id) }),
    'content:download': async (m) => {
      const att = m.conversation.attachments.find((a) => a.id === m.attachmentId);
      if (!att) throw new Error('Unknown attachment');
      const f = await need(adapter.downloadAttachment, 'Downloading files').call(adapter, m.conversation, att);
      return { name: f.name, mimeType: f.mimeType, base64: bytesToBase64(f.bytes) };
    },
    'content:delete': async (m) => {
      await need(adapter.deleteChat, 'Deleting chats').call(adapter, m.chatId);
      return { ok: true as const };
    },
    'content:archive': async (m) => {
      await need(adapter.archiveChat, 'Archiving chats').call(adapter, m.chatId, m.archived);
      return { ok: true as const };
    },
    'content:rename': async (m) => {
      await need(adapter.renameChat, 'Renaming chats').call(adapter, m.chatId, m.title);
      return { ok: true as const };
    },
  };
}
