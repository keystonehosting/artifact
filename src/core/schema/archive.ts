// Artifact archive schema v1 (SPEC §4). One normalized model for every site:
// Conversation -> branch tree of Messages -> Parts, plus Attachments and
// Artifacts whose bytes travel as files next to the JSON. Published as
// schemas/artifact-archive-v1.json; tests/unit/schema.test.ts keeps the two in sync.
import { z } from 'zod';
import { ALL_SITES } from '../sites/sites';

export const ARCHIVE_SCHEMA_URL =
  'https://raw.githubusercontent.com/keystonehosting/artifact/HEAD/schemas/artifact-archive-v1.json';

export const SiteIdSchema = z.enum(ALL_SITES);

export const RoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type Role = z.infer<typeof RoleSchema>;

export const DataSourceSchema = z.enum(['intercept', 'endpoint', 'dom', 'import']);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const TextPartSchema = z.object({
  type: z.literal('text'),
  /** Markdown text. */
  text: z.string(),
});
export const CodePartSchema = z.object({
  type: z.literal('code'),
  language: z.string(),
  code: z.string(),
});
export const MathPartSchema = z.object({
  type: z.literal('math'),
  tex: z.string(),
  display: z.boolean(),
});
export const ToolCallPartSchema = z.object({
  type: z.literal('tool_call'),
  name: z.string(),
  input: z.string(),
  output: z.string().optional(),
});
export const CitationPartSchema = z.object({
  type: z.literal('citation'),
  url: z.string(),
  title: z.string().optional(),
});
export const ThinkingPartSchema = z.object({
  type: z.literal('thinking'),
  text: z.string(),
});
export const ImagePartSchema = z.object({
  type: z.literal('image'),
  attachmentId: z.string(),
  alt: z.string().optional(),
});
export const ArtifactRefPartSchema = z.object({
  type: z.literal('artifact_ref'),
  artifactId: z.string(),
});

export const PartSchema = z.discriminatedUnion('type', [
  TextPartSchema,
  CodePartSchema,
  MathPartSchema,
  ToolCallPartSchema,
  CitationPartSchema,
  ThinkingPartSchema,
  ImagePartSchema,
  ArtifactRefPartSchema,
]);
export type Part = z.infer<typeof PartSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  childIds: z.array(z.string()),
  role: RoleSchema,
  /** Site label for the author, e.g. "ChatGPT" or a GPT/Gem name. */
  author: z.string().optional(),
  model: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  parts: z.array(PartSchema),
  attachmentIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
  status: z.enum(['complete', 'truncated', 'error', 'streaming']).optional(),
  /** Site-hidden system/context messages are kept but flagged. */
  hidden: z.boolean().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  kind: z.enum(['upload', 'generated', 'pasted']),
  name: z.string(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  /** Opaque site reference the adapter uses to download the bytes. */
  ref: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /** Path of the file inside an export ZIP, set when the bytes were captured. */
  file: z.string().optional(),
  /** Why the bytes are missing, when they are. */
  unavailableReason: z.string().optional(),
  /** Extracted text the site exposes for the file (Claude does for many uploads). */
  extractedText: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const ArtifactVersionSchema = z.object({
  content: z.string(),
  createdAt: z.string().nullable().optional(),
  messageId: z.string().optional(),
});
export const ArtifactSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  kind: z.enum(['claude-artifact', 'chatgpt-canvas', 'gemini-canvas', 'document']),
  title: z.string(),
  /** MIME-ish type: text/markdown, text/html, application/vnd.ant.react, image/svg+xml, code language... */
  type: z.string(),
  language: z.string().optional(),
  versions: z.array(ArtifactVersionSchema).min(1),
  file: z.string().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const MetadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const ConversationSchema = z.object({
  /** `${site}:${siteChatId}` */
  id: z.string(),
  site: SiteIdSchema,
  siteChatId: z.string(),
  url: z.string().nullable(),
  title: z.string(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  project: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  messages: z.record(z.string(), MessageSchema),
  rootIds: z.array(z.string()),
  /** Leaf of the branch the site currently shows. */
  currentLeafId: z.string().nullable(),
  attachments: z.array(AttachmentSchema),
  artifacts: z.array(ArtifactSchema),
  source: z.object({
    method: DataSourceSchema,
    approximate: z.boolean(),
    capturedAt: z.string(),
  }),
  metadata: MetadataSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** ACE export-v1 compatible flat message, emitted for the active branch. */
export const FlatMessageSchema = z.object({
  index: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant', 'system', 'tool', 'artifact', 'unknown']),
  displayRole: z.string(),
  content: z.string(),
  timestamp: z.string().optional(),
  id: z.string().optional(),
  model: z.string().optional(),
});

export const ExportedConversationSchema = ConversationSchema.extend({
  /** ACE export-v1 fields, so tools that read ACE exports read ours. */
  source_ace: z
    .object({ platform: z.string(), url: z.string().nullable(), title: z.string() })
    .optional(),
  activeBranch: z.array(FlatMessageSchema),
});
export type ExportedConversation = z.infer<typeof ExportedConversationSchema>;

export const ProjectExportSchema = z.object({
  site: SiteIdSchema,
  id: z.string(),
  name: z.string(),
  instructions: z.string().nullable().optional(),
  knowledge: z.array(
    z.object({ id: z.string(), name: z.string(), file: z.string().optional(), content: z.string().optional() }),
  ),
  memory: z.string().nullable().optional(),
});
export type ProjectExport = z.infer<typeof ProjectExportSchema>;

export const ArchiveSchema = z.object({
  $schema: z.string(),
  schemaVersion: z.literal(1),
  kind: z.literal('artifact-archive'),
  exportedAt: z.string(),
  generator: z.object({ name: z.literal('Artifact'), version: z.string() }),
  conversations: z.array(ExportedConversationSchema),
  projects: z.array(ProjectExportSchema).optional(),
  /** Library data (folders, tags, bookmarks...) when the user exports everything. */
  library: z.record(z.string(), z.unknown()).optional(),
});
export type Archive = z.infer<typeof ArchiveSchema>;
