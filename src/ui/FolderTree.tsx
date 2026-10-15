// The folder tree, shared by the site sidebar and the side panel. Rows are
// buttons for keyboard use; drag and drop moves chats between folders,
// re-parents folders, and files chat links dragged from the site's own list.
import { useState } from 'preact/hooks';
import type { FolderNode } from '../core/library/folders';
import type { ChatRow } from '../core/db/db';
import { COLOR_VALUES, type ColorName } from './colors';
import { Icon } from './icons';
import { t } from '../core/i18n/t';

export type DragData =
  | { kind: 'chats'; chatIds: string[]; from: string | null }
  | { kind: 'folder'; id: string }
  | { kind: 'url'; url: string; title: string };

const MIME = 'application/x-artifact';

export function setDragData(e: DragEvent, data: DragData): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(MIME, JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'copyMove';
}

/** Reads what was dropped: our own payload, or a plain link dragged from the page. */
export function readDragData(e: DragEvent): DragData | null {
  const dt = e.dataTransfer;
  if (!dt) return null;
  const own = dt.getData(MIME);
  if (own) {
    try {
      return JSON.parse(own) as DragData;
    } catch {
      return null;
    }
  }
  const url = (dt.getData('text/uri-list') || dt.getData('text/plain')).split('\n').find((l) => /^https?:\/\//.test(l.trim()));
  if (!url) return null;
  const html = dt.getData('text/html');
  const title = html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() : '';
  return { kind: 'url', url: url.trim(), title };
}

export function colorValue(color: string | null, dark: boolean): string | undefined {
  return color && color in COLOR_VALUES ? COLOR_VALUES[color as ColorName][dark ? 'dark' : 'light'] : undefined;
}

export interface FolderTreeProps {
  nodes: FolderNode[];
  dark: boolean;
  selected?: string | null;
  /** Folder ids shown open. */
  open: Set<string>;
  onToggle(id: string): void;
  onSelect?(id: string): void;
  /** Chats listed under an open folder (sidebar); omitted in the side panel, which lists them separately. */
  chatsOf?(id: string): ChatRow[] | undefined;
  onOpenChat?(chat: ChatRow, e: MouseEvent): void;
  onDrop(target: string | null, data: DragData): void;
}

export function FolderTree(p: FolderTreeProps) {
  return (
    <ul role="tree">
      {p.nodes.map((n) => (
        <FolderItem key={n.id} node={n} {...p} />
      ))}
    </ul>
  );
}

function FolderItem(p: FolderTreeProps & { node: FolderNode }) {
  const { node } = p;
  const [over, setOver] = useState(false);
  const isOpen = p.open.has(node.id);
  const chats = isOpen ? p.chatsOf?.(node.id) : undefined;
  const hasKids = node.children.length > 0 || node.count > 0;
  return (
    <li role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-selected={p.selected === node.id}>
      <button
        class={`row${over ? ' drop' : ''}${p.selected === node.id ? ' sel' : ''}`}
        draggable
        title={node.name}
        onClick={() => (p.onSelect ? p.onSelect(node.id) : p.onToggle(node.id))}
        onDblClick={() => p.onSelect && p.onToggle(node.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' && !isOpen) p.onToggle(node.id);
          if (e.key === 'ArrowLeft' && isOpen) p.onToggle(node.id);
        }}
        onDragStart={(e) => setDragData(e, { kind: 'folder', id: node.id })}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const d = readDragData(e);
          if (d && !(d.kind === 'folder' && d.id === node.id)) p.onDrop(node.id, d);
        }}
      >
        <span
          class="twisty"
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            p.onToggle(node.id);
          }}
        >
          {hasKids ? <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /> : null}
        </span>
        <span class="dot" style={{ background: colorValue(node.color, p.dark) }} />
        <span class="name">{node.name}</span>
        {node.pinned ? <Icon name="pin" size={11} label={t('folder_pinned')} /> : null}
        {node.starred ? <Icon name="star" size={11} label={t('folder_starred')} /> : null}
        <span class="count" title={t('folder_count_title', [String(node.count), String(node.total)])}>
          {node.total}
        </span>
      </button>
      {isOpen && (node.children.length > 0 || chats?.length) ? (
        <ul role="group">
          {node.children.map((c) => (
            <FolderItem key={c.id} {...p} node={c} />
          ))}
          {chats?.map((c) => (
            <li key={c.id} role="treeitem">
              <a
                class="row chat"
                href={c.url ?? undefined}
                draggable
                title={c.title}
                onDragStart={(e) => setDragData(e, { kind: 'chats', chatIds: [c.id], from: node.id })}
                onClick={(e) => p.onOpenChat?.(c, e)}
              >
                <span class="site">{c.site}</span>
                <span class="chat-title">{c.title}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
