// Artifact's local library (SPEC §4 data model, §6B–C). IndexedDB through
// Dexie, in the extension's own origin: the background writes, extension
// pages read. Nothing here ever leaves the browser except through an export
// or backup the user starts.
import Dexie, { type EntityTable } from 'dexie';
import type { Conversation } from '../schema/archive';
import type { SiteId } from '../sites/sites';

export interface ChatRow {
  /** `${site}:${siteChatId}` */
  id: string;
  site: SiteId;
  siteChatId: string;
  title: string;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  model: string | null;
  projectId: string | null;
  projectName: string | null;
  archived: 0 | 1;
  pinned: 0 | 1;
  /** Tags the user set. */
  tags: string[];
  /** Tags Smart Tag rules set; recomputed on every ingest. */
  autoTags: string[];
  /** Number of messages on the active branch, when the conversation was read. */
  messageCount: number;
  /** When the full conversation was last stored and indexed. */
  indexedAt: number | null;
  /** When the chat was seen in a site listing (deep scan). */
  listedAt: number | null;
  lastOpenedAt: number | null;
  /** Site's list says the chat changed after we indexed it. */
  stale: 0 | 1;
}

export interface FolderRow {
  id: string;
  parentId: string | null;
  name: string;
  color: string | null;
  sort: 'recent' | 'az' | 'za' | 'manual';
  /** Position among siblings when the parent sorts manually. */
  order: number;
  pinned: 0 | 1;
  starred: 0 | 1;
  createdAt: number;
  /** Where the folder came from when imported: "chatgpt:project:<id>". */
  origin: string | null;
}

export interface FolderItemRow {
  folderId: string;
  chatId: string;
  order: number;
  addedAt: number;
}

export interface TagRow {
  name: string;
  color: string | null;
  createdAt: number;
}

export interface TagRuleRow {
  id: string;
  tag: string;
  terms: string[];
  match: 'any' | 'all';
  fields: Array<'title' | 'content'>;
  sites: SiteId[];
  enabled: 0 | 1;
  builtin: 0 | 1;
}

export interface LabelRow {
  id: string;
  chatId: string;
  messageId: string;
  color: string;
  text: string;
  createdAt: number;
}

export interface BookmarkRow {
  id: string;
  chatId: string;
  messageId: string;
  site: SiteId;
  color: string;
  note: string;
  snippet: string;
  createdAt: number;
}

export interface HighlightRow {
  id: string;
  chatId: string;
  messageId: string;
  site: SiteId;
  quote: string;
  /** Text right before and after the quote, to find it again on the page. */
  prefix: string;
  suffix: string;
  color: string;
  note: string;
  createdAt: number;
}

export interface NoteRow {
  chatId: string;
  text: string;
  updatedAt: number;
}

export interface ReminderRow {
  id: string;
  chatId: string;
  dueAt: number;
  note: string;
  done: 0 | 1;
}

export interface FavoriteRow {
  /** `${site}:${kind}:${id}` */
  id: string;
  site: SiteId;
  kind: 'gpt' | 'gem' | 'project';
  name: string;
  url: string | null;
  addedAt: number;
}

export interface ConversationRow {
  id: string;
  data: Conversation;
  storedAt: number;
}

export interface PromptRow {
  id: string;
  name: string;
  /** Template text (src/core/prompts/template.ts). */
  body: string;
  category: string;
  favorite: 0 | 1;
  pinned: 0 | 1;
  uses: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Send right after inserting. Off unless the user turns it on for this prompt. */
  autoSend: boolean;
  /** Files from the prompt file library attached on every use. */
  fileIds: string[];
  /** Where an imported prompt came from, e.g. "starter:<name>". */
  source: string | null;
}

export interface ChainStep {
  name: string;
  text: string;
  /** After this step: continue when the reply finishes, or wait for the user. */
  after: 'reply' | 'confirm';
}

export interface ChainRow {
  id: string;
  name: string;
  steps: ChainStep[];
  uses: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PromptFileRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Base64, so the file crosses extension messaging unchanged. */
  data: string;
  addedAt: number;
}

export interface HistoryRow {
  seq?: number;
  site: SiteId;
  text: string;
  at: number;
}

export interface HandoffRow {
  id: string;
  at: number;
  fromChatId: string | null;
  fromTitle: string;
  fromSite: SiteId;
  targetSite: SiteId;
  mode: 'local' | 'chat' | 'api';
  text: string;
}

export interface DraftRow {
  /** `${site}:${chatId}`, or `${site}:new` for a new chat. */
  key: string;
  text: string;
  updatedAt: number;
}

export interface KvRow {
  key: string;
  value: unknown;
}

export class ArtifactDB extends Dexie {
  chats!: EntityTable<ChatRow, 'id'>;
  conversations!: EntityTable<ConversationRow, 'id'>;
  folders!: EntityTable<FolderRow, 'id'>;
  folderItems!: Dexie.Table<FolderItemRow, [string, string]>;
  tags!: EntityTable<TagRow, 'name'>;
  tagRules!: EntityTable<TagRuleRow, 'id'>;
  labels!: EntityTable<LabelRow, 'id'>;
  bookmarks!: EntityTable<BookmarkRow, 'id'>;
  highlights!: EntityTable<HighlightRow, 'id'>;
  notes!: EntityTable<NoteRow, 'chatId'>;
  reminders!: EntityTable<ReminderRow, 'id'>;
  favorites!: EntityTable<FavoriteRow, 'id'>;
  kv!: EntityTable<KvRow, 'key'>;
  prompts!: EntityTable<PromptRow, 'id'>;
  chains!: EntityTable<ChainRow, 'id'>;
  promptFiles!: EntityTable<PromptFileRow, 'id'>;
  history!: EntityTable<HistoryRow, 'seq'>;
  handoffs!: EntityTable<HandoffRow, 'id'>;
  drafts!: EntityTable<DraftRow, 'key'>;

  constructor(name = 'artifact') {
    super(name);
    this.version(1).stores({
      chats: 'id, site, updatedAt, lastOpenedAt, projectId, pinned, archived, stale, *tags, *autoTags',
      conversations: 'id, storedAt',
      folders: 'id, parentId, pinned, starred, origin',
      folderItems: '[folderId+chatId], folderId, chatId',
      tags: 'name',
      tagRules: 'id, tag',
      labels: 'id, chatId, color, createdAt',
      bookmarks: 'id, chatId, site, color, createdAt',
      highlights: 'id, chatId, site, color, createdAt',
      notes: 'chatId, updatedAt',
      reminders: 'id, chatId, dueAt, done',
      favorites: 'id, site, kind',
      kv: 'key',
    });
    this.version(2).stores({
      prompts: 'id, category, favorite, pinned, uses, lastUsedAt, updatedAt, source',
      chains: 'id, uses, lastUsedAt',
      promptFiles: 'id, name',
      history: '++seq, site, at',
      handoffs: 'id, at',
      drafts: 'key, updatedAt',
    });
  }
}

let instance: ArtifactDB | null = null;

export function db(): ArtifactDB {
  instance ??= new ArtifactDB();
  return instance;
}

/** Tests use a fresh database per case. */
export function setDb(next: ArtifactDB): void {
  instance = next;
}

export function newId(): string {
  return crypto.randomUUID();
}
