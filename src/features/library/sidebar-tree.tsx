// Cross-site folders inside the site's own sidebar (SPEC §6B). Mounted at the
// top of the sidebar in a closed shadow host and re-mounted when the site
// re-renders its sidebar. Links dragged from the site's chat list file the chat.
import { browser } from 'wxt/browser';
import { useEffect, useState } from 'preact/hooks';
import type { SiteAdapter } from '../../adapters/types';
import { mountShadow, pageIsDark, watchTheme, type ShadowMount } from '../../ui/shadow';
import { lib } from '../../core/library/client';
import type { FolderNode } from '../../core/library/folders';
import type { ChatRow } from '../../core/db/db';
import { FolderTree, type DragData } from '../../ui/FolderTree';
import { Icon } from '../../ui/icons';
import { t } from '../../core/i18n/t';
import { libraryIdForUrl } from '../../core/sites/chat-urls';

const OPEN_KEY = 'sidebar:open';

/** Files whatever was dropped on a folder; shared with the side panel. */
export async function fileDrop(target: string | null, d: DragData): Promise<void> {
  if (d.kind === 'folder') return lib('moveFolder', d.id, target);
  if (!target) return;
  if (d.kind === 'chats') return lib('moveChats', d.from, target, d.chatIds);
  const chatId = libraryIdForUrl(d.url);
  if (!chatId) throw new Error(t('folder_drop_unknown'));
  const [site, siteChatId] = [chatId.slice(0, chatId.indexOf(':')), chatId.slice(chatId.indexOf(':') + 1)];
  // A chat the library hasn't seen yet gets a listing row so the folder can show it.
  await lib('noteListed', site as ChatRow['site'], [{ siteChatId, title: d.title, url: d.url, updatedAt: null }]);
  await lib('addToFolder', target, [chatId]);
}

function SidebarTreeView({ adapter, dark }: { adapter: SiteAdapter; dark: boolean }) {
  const [nodes, setNodes] = useState<FolderNode[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [chats, setChats] = useState<Map<string, ChatRow[]>>(new Map());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = async (openIds = open) => {
    setNodes(await lib('folderTree', 'manual'));
    const lists = await Promise.all([...openIds].map(async (id) => [id, await lib('chatsInFolder', id)] as const));
    setChats(new Map(lists));
  };

  useEffect(() => {
    void (async () => {
      const saved = (await lib('kvGet', OPEN_KEY)) as { open?: string[]; collapsed?: boolean } | null;
      const ids = new Set(saved?.open ?? []);
      setOpen(ids);
      setCollapsed(!!saved?.collapsed);
      await load(ids);
    })();
    const onMsg = (m: unknown) => {
      if ((m as { type?: string })?.type === 'lib:changed') void load();
    };
    browser.runtime.onMessage.addListener(onMsg);
    return () => browser.runtime.onMessage.removeListener(onMsg);
  }, []);

  const persist = (ids: Set<string>, c: boolean) => void lib('kvSet', OPEN_KEY, { open: [...ids], collapsed: c });
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
    persist(next, collapsed);
    void load(next);
  };
  const run = (p: Promise<unknown>) =>
    p.then(
      () => (setError(''), load()),
      (e: Error) => setError(e.message),
    );
  return (
    <div class="tree">
      <div class="tree-bar">
        <button
          class="tree-head"
          aria-expanded={!collapsed}
          onClick={() => {
            setCollapsed(!collapsed);
            persist(open, !collapsed);
          }}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
          {t('folders_title')}
        </button>
        <button class="tree-add" aria-label={t('folder_new')} title={t('folder_new')} onClick={() => setAdding(!adding)}>
          <Icon name="plus" size={12} />
        </button>
      </div>
      {!collapsed && (
        <>
          {adding && (
            <input
              class="tree-input"
              aria-label={t('folder_name')}
              placeholder={t('folder_name')}
              ref={(el) => el?.focus()}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === 'Enter' && el.value.trim()) {
                  setAdding(false);
                  void run(lib('createFolder', el.value, null));
                }
                if (e.key === 'Escape') setAdding(false);
              }}
            />
          )}
          {nodes.length === 0 && !adding ? <p class="tree-empty">{t('folders_empty_sidebar')}</p> : null}
          <FolderTree
            nodes={nodes}
            dark={dark}
            open={open}
            onToggle={toggle}
            chatsOf={(id) => chats.get(id)}
            onOpenChat={(c, e) => {
              if (!c.url) return;
              e.preventDefault();
              if (c.site === adapter.id) location.assign(c.url);
              else window.open(c.url, '_blank', 'noopener');
            }}
            onDrop={(target, d) => void run(fileDrop(target, d))}
          />
          {error ? <p class="tree-error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}

export class SidebarTree {
  private mount: ShadowMount | null = null;
  private dark = false;

  constructor(private readonly adapter: SiteAdapter) {}

  start(): () => void {
    let timer: number | undefined;
    const ensure = () => {
      const anchor = this.adapter.getSidebarAnchor();
      if (!anchor) return;
      if (this.mount?.host.isConnected && this.mount.host.parentElement === anchor) return;
      this.mount?.remove();
      this.mount = mountShadow('artifact-folders', { inline: true });
      anchor.prepend(this.mount.host);
      this.render();
    };
    const obs = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(ensure, 300);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const offTheme = watchTheme((d) => {
      this.dark = d;
      this.render();
    });
    this.dark = pageIsDark();
    ensure();
    return () => {
      obs.disconnect();
      offTheme();
      window.clearTimeout(timer);
      this.mount?.remove();
      this.mount = null;
    };
  }

  private render(): void {
    if (!this.mount) return;
    this.mount.setTheme(this.dark);
    this.mount.update(<SidebarTreeView adapter={this.adapter} dark={this.dark} />);
  }
}
