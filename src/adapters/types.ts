// The adapter contract (SPEC §5). Every site implements this interface; the
// core never contains site-specific code. Methods a site cannot support are
// absent and the matching `capabilities` flag is false, so the UI hides them.
import type { Attachment, Artifact, Conversation, DataSource, Message } from '../core/schema/archive';
import type { SiteHealth } from '../core/health/health';
import type { SiteId } from '../core/sites/sites';
import type { Plan } from '../core/limits/limits';

export interface Capabilities {
  /** Reads the conversation through the site's own data (intercept or endpoint). */
  structuredRead: boolean;
  branches: boolean;
  listChats: boolean;
  projects: boolean;
  deleteChat: boolean;
  archiveChat: boolean;
  renameChat: boolean;
  attachments: boolean;
  artifacts: boolean;
  usage: boolean;
  modelSwitch: boolean;
  fillComposer: boolean;
  sidebarFolders: boolean;
  /** Site reports a real token count we can calibrate against (AI Studio). */
  reportsTokenCount: boolean;
}

export interface ChatSummary {
  siteChatId: string;
  title: string;
  url: string;
  updatedAt: string | null;
  createdAt?: string | null;
  projectId?: string | null;
  archived?: boolean;
  pinned?: boolean;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page; null when done. */
  next: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  kind: 'project' | 'gpt' | 'gem' | 'folder';
  url?: string;
}

export interface ProjectDetail extends ProjectSummary {
  instructions: string | null;
  knowledge: Array<{ id: string; name: string; content?: string; downloadable: boolean }>;
  memory: string | null;
}

export interface UsageWindow {
  /** e.g. "5-hour", "weekly", "daily". */
  label: string;
  /** 0..1, or null when the site gives no fraction. */
  fraction: number | null;
  used?: number | null;
  limit?: number | null;
  resetsAt: string | null;
}

export interface UsageReport {
  windows: UsageWindow[];
  source: DataSource;
  /** Prompt-cache expiry (Claude), only when observed live. */
  cacheExpiresAt?: string | null;
}

export interface ModelInfo {
  /** Site model slug exactly as observed, e.g. "gpt-5" or "claude-sonnet-4-5". */
  slug: string | null;
  label: string | null;
  source: DataSource;
}

export interface FileBytes {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface Read<T> {
  value: T;
  source: DataSource;
  approximate: boolean;
}

export interface SiteAdapter {
  readonly id: SiteId;
  readonly capabilities: Capabilities;

  // ---- page ----
  /** The site's id for the conversation on screen, or null on a new/empty chat. */
  detectConversation(): string | null;
  /** The site's chat id in any chat URL on this site (sidebar links, drag and drop). */
  chatIdFromUrl(url: URL): string | null;
  /** Full conversation for the open chat: active branch plus every branch the site exposes. */
  readConversation(): Promise<Read<Conversation> | null>;
  getActiveBranch(conv: Conversation): Message[];
  getAllBranches(conv: Conversation): string[][];
  getModel(): Promise<ModelInfo>;
  getDraftText(): string;
  /** The composer the user types into, when it is on the page. */
  getComposerElement(): HTMLElement | null;
  /** Called with the composer text just before the user sends it (Enter or the send button). */
  onSend(cb: (text: string) => void): () => void;
  fillComposer(text: string, files?: File[]): Promise<boolean>;
  /** Only called on an explicit user action. */
  submit(): Promise<boolean>;
  newChatUrl(): string;
  onConversationChange(cb: (siteChatId: string | null) => void): () => void;
  onStreamingDone(cb: () => void): () => void;
  /** Called after every successful read of the open chat. */
  onConversationRead(cb: (r: Read<Conversation>) => void): () => void;
  isStreaming(): boolean;

  // ---- account data ----
  listChats?(cursor: string | null): Promise<Page<ChatSummary>>;
  getChat?(siteChatId: string): Promise<Read<Conversation>>;
  listProjects?(): Promise<ProjectSummary[]>;
  getProject?(id: string): Promise<ProjectDetail>;
  deleteChat?(siteChatId: string): Promise<void>;
  archiveChat?(siteChatId: string, archived: boolean): Promise<void>;
  renameChat?(siteChatId: string, title: string): Promise<void>;

  // ---- files ----
  downloadAttachment?(conv: Conversation, att: Attachment): Promise<FileBytes>;
  getArtifacts?(conv: Conversation): Promise<Artifact[]>;

  // ---- usage and anchors ----
  getUsage?(): Promise<UsageReport | null>;
  /** Account plan, when the site exposes it; used for limit lookup. */
  getPlan?(): Promise<Plan | null>;
  /** Token count and limit the page itself shows (AI Studio). */
  siteTokenCount?(): { used: number; limit: number } | null;
  getSidebarAnchor(): Element | null;
  getComposerAnchor(): Element | null;
  getMessageAnchors(): Array<{ messageId: string | null; index: number; element: Element; role: Message['role'] }>;

  health(): SiteHealth;
  onHealthChange(cb: (h: SiteHealth) => void): () => void;
  /** Self-test (SPEC §6M): run every check on the current page. */
  selfTest(): Promise<SiteHealth>;
  dispose(): void;
}
