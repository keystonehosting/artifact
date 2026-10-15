// Generic DOM-fallback reader (data source 3 in SPEC §5). Reads the turns the
// page has rendered, in document order. Always labelled approximate: it only
// sees the visible branch and whatever the site has rendered so far.
import type { Conversation, Message, Part, Role } from '../core/schema/archive';
import { htmlToParts } from '../core/dom/html-to-parts';
import { linearMessages } from '../core/model/tree';
import type { SiteId } from '../core/sites/sites';

export interface DomTurn {
  element: Element;
  role: Role;
  content: Element;
  id: string | null;
  model?: string | null;
}

export interface DomReaderConfig {
  site: SiteId;
  /** Selector matching one element per turn, in document order. */
  turns: string;
  role(el: Element): Role | null;
  /** Element holding the rendered content; defaults to the turn element. */
  content?(el: Element, role: Role): Element | null;
  id?(el: Element): string | null;
  model?(el: Element): string | null;
  /** Extra selectors to drop from content (site toolbars, buttons...). */
  skip?: string;
  title(doc: Document): string;
}

export function readDomTurns(doc: Document, cfg: DomReaderConfig): DomTurn[] {
  const all = Array.from(doc.querySelectorAll(cfg.turns));
  // Drop matches nested inside another match (sites nest identical markers).
  const top = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  const turns: DomTurn[] = [];
  for (const el of top) {
    const role = cfg.role(el);
    if (!role) continue;
    const content = cfg.content ? cfg.content(el, role) : el;
    if (!content) continue;
    turns.push({ element: el, role, content, id: cfg.id?.(el) ?? null, model: cfg.model?.(el) ?? null });
  }
  return turns;
}

export function readDomConversation(
  doc: Document,
  cfg: DomReaderConfig,
  siteChatId: string,
  url: string,
): Conversation | null {
  const turns = readDomTurns(doc, cfg);
  if (!turns.length) return null;
  const used = new Set<string>();
  const items: Array<Omit<Message, 'parentId' | 'childIds'>> = turns.map((t, i) => {
    let id = t.id ?? `dom-${i}`;
    if (used.has(id)) id = `${id}-${i}`;
    used.add(id);
    const parts: Part[] = htmlToParts(t.content, { skip: cfg.skip });
    return {
      id,
      role: t.role,
      model: t.model ?? null,
      createdAt: null,
      parts,
      attachmentIds: [],
      artifactIds: [],
    };
  });
  const tree = linearMessages(items);
  return {
    id: `${cfg.site}:${siteChatId}`,
    site: cfg.site,
    siteChatId,
    url,
    title: cfg.title(doc),
    createdAt: null,
    updatedAt: null,
    model: [...turns].reverse().find((t) => t.model)?.model ?? null,
    project: null,
    ...tree,
    attachments: [],
    artifacts: [],
    source: { method: 'dom', approximate: true, capturedAt: new Date().toISOString() },
    metadata: {},
  };
}

export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
