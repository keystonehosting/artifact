// Branch-tree operations over a Conversation's message map.
import type { Conversation, Message, Part } from '../schema/archive';

/**
 * Messages on the branch ending at `leafId` (default: the conversation's
 * current leaf), root first. Walks parent links, so it is correct for any
 * number of edits and regenerations. Cycles and dangling parents stop the walk.
 */
export function activeBranch(conv: Pick<Conversation, 'messages' | 'currentLeafId' | 'rootIds'>, leafId?: string | null): Message[] {
  const start = leafId ?? conv.currentLeafId ?? deepestLeaf(conv);
  const out: Message[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = start;
  while (id && !seen.has(id)) {
    seen.add(id);
    const msg: Message | undefined = conv.messages[id];
    if (!msg) break;
    out.push(msg);
    id = msg.parentId;
  }
  return out.reverse();
}

/** When a site gives no current node, follow the last child at every fork. */
export function deepestLeaf(conv: Pick<Conversation, 'messages' | 'rootIds'>): string | null {
  const root = conv.rootIds[conv.rootIds.length - 1];
  if (!root) return null;
  let id = root;
  const seen = new Set<string>();
  while (!seen.has(id)) {
    seen.add(id);
    const msg = conv.messages[id];
    if (!msg) return null;
    const next = msg.childIds[msg.childIds.length - 1];
    if (!next || !conv.messages[next]) return id;
    id = next;
  }
  return id;
}

/** Every root-to-leaf path. Each path is a list of message ids. */
export function allBranches(conv: Pick<Conversation, 'messages' | 'rootIds'>): string[][] {
  const out: string[][] = [];
  const stack: Array<{ id: string; path: string[] }> = [...conv.rootIds].reverse().map((id) => ({ id, path: [] }));
  const visited = new Set<string>();
  while (stack.length) {
    const { id, path } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const msg = conv.messages[id];
    if (!msg) continue;
    const next = [...path, id];
    const children = msg.childIds.filter((c) => conv.messages[c]);
    if (!children.length) out.push(next);
    else for (let i = children.length - 1; i >= 0; i--) stack.push({ id: children[i]!, path: next });
  }
  return out;
}

/** Messages with more than one child: where the user edited or regenerated. */
export function forkPoints(conv: Pick<Conversation, 'messages'>): Message[] {
  return Object.values(conv.messages).filter((m) => m.childIds.filter((c) => conv.messages[c]).length > 1);
}

/** Position of `childId` among its siblings, 1-based, e.g. "2 of 3" for the UI. */
export function siblingPosition(conv: Pick<Conversation, 'messages' | 'rootIds'>, childId: string): { index: number; count: number } {
  const msg = conv.messages[childId];
  const siblings = msg?.parentId ? (conv.messages[msg.parentId]?.childIds ?? []) : conv.rootIds;
  const index = siblings.indexOf(childId);
  return { index: index + 1, count: siblings.length };
}

/** Plain text of a message's visible parts, used for counting and search. */
export function messageText(msg: Pick<Message, 'parts'>, opts: { includeThinking?: boolean } = {}): string {
  return msg.parts.map((p) => partText(p, opts)).filter(Boolean).join('\n\n');
}

export function partText(p: Part, opts: { includeThinking?: boolean } = {}): string {
  switch (p.type) {
    case 'text':
      return p.text;
    case 'code':
      return p.code;
    case 'math':
      return p.tex;
    case 'tool_call':
      return [p.input, p.output ?? ''].filter(Boolean).join('\n');
    case 'citation':
      return p.title ? `${p.title} ${p.url}` : p.url;
    case 'thinking':
      return opts.includeThinking ? p.text : '';
    case 'image':
      return p.alt ?? '';
    case 'artifact_ref':
      return '';
  }
}

/** Builds a conversation tree from a flat, ordered list (DOM and simple sources). */
export function linearMessages<T extends Omit<Message, 'parentId' | 'childIds'>>(items: T[]): {
  messages: Record<string, Message>;
  rootIds: string[];
  currentLeafId: string | null;
} {
  const messages: Record<string, Message> = {};
  let prev: string | null = null;
  for (const item of items) {
    messages[item.id] = { ...item, parentId: prev, childIds: [] };
    if (prev) messages[prev]!.childIds.push(item.id);
    prev = item.id;
  }
  return { messages, rootIds: items[0] ? [items[0].id] : [], currentLeafId: prev };
}
