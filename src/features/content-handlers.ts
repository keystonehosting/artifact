// Handlers for messages sent to the content script. Every account-changing
// action (delete, archive, rename) only runs on an explicit request from an
// extension page, where the destructive-action guardrails apply first.
import type { SiteInfo } from '../core/sites/sites';
import type { SiteAdapter } from '../adapters/types';
import type { ContentMessage, ContentRequests } from '../core/messaging/protocol';
import { bytesToBase64 } from '../core/util/bytes';
import type { Features } from './runtime';
import { jumpTo } from './library/jump';
import { isBlurred, setBlur } from './library/blur';
import { lib } from '../core/library/client';
import { activeBranch, messageText } from '../core/model/tree';
import { applyPrompt } from './prompts/insert';

type Handlers = { [K in keyof ContentRequests]: (msg: Extract<ContentMessage, { type: K }>) => Promise<ContentRequests[K]['res']> };

function need<T>(fn: T | undefined, what: string): T {
  if (!fn) throw new Error(`${what} is not supported on this site`);
  return fn;
}

export function contentHandlers(site: SiteInfo, adapter: SiteAdapter, f: Features): Handlers {
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
    'content:jump': async (m) => jumpTo(adapter, f.state, m),
    'content:find': async () => {
      f.find.toggle();
      return { open: f.find.isOpen };
    },
    'content:blur': async (m) => {
      setBlur(adapter, m.on ?? !isBlurred());
      return { on: isBlurred() };
    },
    'content:deep-scan': async (m) => {
      if (f.scan.isRunning) return { started: false };
      // Runs in the background of the page; progress arrives as scan:progress messages.
      void f.scan.run(m.fresh).catch(() => undefined);
      return { started: true };
    },
    'content:deep-scan-stop': async () => {
      f.scan.stop();
      return { ok: true as const };
    },
    'content:insert-prompt': async (m) => {
      const prompt = await lib('prompt', m.promptId);
      if (!prompt) throw new Error('That prompt no longer exists');
      return { ok: await applyPrompt(adapter, prompt, { selection: m.selection, before: m.selection ? undefined : adapter.getDraftText() }) };
    },
    'content:run-chain': async (m) => {
      const chain = await lib('chain', m.chainId);
      if (!chain) throw new Error('That chain no longer exists');
      // The variables form shows in the page; the answer arrives later.
      void f.triggers.runChain(chain);
      return { ok: true as const };
    },
    'content:queue': async (m) => {
      for (const text of m.texts.map((x) => x.trim()).filter(Boolean)) f.runner.enqueue(text);
      return { ok: true as const };
    },
    'content:last-reply': async () => {
      const streaming = adapter.isStreaming();
      const read = streaming ? null : await adapter.readConversation().catch(() => null);
      const msgs = read ? activeBranch(read.value).filter((x) => !x.hidden) : [];
      const last = msgs[msgs.length - 1];
      return { streaming, reply: last?.role === 'assistant' ? messageText(last) : null, chatId: adapter.detectConversation() };
    },
  };
}
