// ChatGPT payloads. Field names follow the backend-api responses as read by
// Loominary (MIT) and listed in docs/provider-notes.md; not yet confirmed live
// by this project. Schemas validate only what Artifact reads and pass the
// rest through, so additive site changes don't break us but a renamed or
// retyped field flips health to Degraded.
import { z } from 'zod';

export const ChatGPTSessionSchema = z.looseObject({
  accessToken: z.string().min(1),
});

const ContentSchema = z.looseObject({
  content_type: z.string(),
  parts: z.array(z.unknown()).optional(),
  text: z.string().optional(),
  language: z.string().optional(),
  result: z.string().optional(),
});

export const ChatGPTMessageSchema = z.looseObject({
  id: z.string(),
  author: z.looseObject({ role: z.string(), name: z.string().nullable().optional() }),
  create_time: z.number().nullable().optional(),
  content: ContentSchema,
  status: z.string().optional(),
  recipient: z.string().optional(),
  metadata: z
    .looseObject({
      model_slug: z.string().optional(),
      is_visually_hidden_from_conversation: z.boolean().optional(),
      attachments: z
        .array(
          z.looseObject({
            id: z.string(),
            name: z.string().optional(),
            mime_type: z.string().optional(),
            size: z.number().optional(),
          }),
        )
        .optional(),
      content_references: z.array(z.unknown()).optional(),
    })
    .optional(),
});
export type ChatGPTMessage = z.infer<typeof ChatGPTMessageSchema>;

export const ChatGPTNodeSchema = z.looseObject({
  id: z.string(),
  message: ChatGPTMessageSchema.nullable().optional(),
  parent: z.string().nullable().optional(),
  children: z.array(z.string()),
});

export const ChatGPTConversationSchema = z.looseObject({
  title: z.string().nullable().optional(),
  create_time: z.number().nullable().optional(),
  update_time: z.number().nullable().optional(),
  mapping: z.record(z.string(), ChatGPTNodeSchema),
  current_node: z.string().nullable().optional(),
  conversation_id: z.string().optional(),
  default_model_slug: z.string().nullable().optional(),
  gizmo_id: z.string().nullable().optional(),
  is_archived: z.boolean().optional(),
});
export type ChatGPTConversation = z.infer<typeof ChatGPTConversationSchema>;

export const ChatGPTListSchema = z.looseObject({
  items: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string().nullable(),
      create_time: z.union([z.string(), z.number()]).nullable().optional(),
      update_time: z.union([z.string(), z.number()]).nullable().optional(),
      is_archived: z.boolean().optional(),
      gizmo_id: z.string().nullable().optional(),
    }),
  ),
  total: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const ChatGPTFileDownloadSchema = z.looseObject({
  download_url: z.string(),
  file_name: z.string().optional(),
});
