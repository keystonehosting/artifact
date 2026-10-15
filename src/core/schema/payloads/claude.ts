// claude.ai payloads, as read by Loominary and Claude Counter (both MIT).
// Not yet confirmed live by this project; see docs/provider-notes.md.
import { z } from 'zod';

export const ClaudeOrganizationsSchema = z.array(
  z.looseObject({
    uuid: z.string(),
    name: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  }),
);

const ContentBlockSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  content: z.unknown().optional(),
});

const FileV2Schema = z.looseObject({
  file_uuid: z.string().optional(),
  uuid: z.string().optional(),
  file_name: z.string().optional(),
  file_kind: z.string().optional(),
  preview_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  document_asset: z.unknown().optional(),
});

export const ClaudeMessageSchema = z.looseObject({
  uuid: z.string(),
  sender: z.enum(['human', 'assistant']),
  index: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  text: z.string().optional(),
  content: z.array(ContentBlockSchema).optional(),
  parent_message_uuid: z.string().nullable().optional(),
  attachments: z
    .array(
      z.looseObject({
        id: z.string().optional(),
        file_name: z.string(),
        file_size: z.number().optional(),
        file_type: z.string().optional(),
        extracted_content: z.string().optional(),
      }),
    )
    .optional(),
  files: z.array(FileV2Schema).optional(),
  files_v2: z.array(FileV2Schema).optional(),
});
export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;

export const ClaudeConversationSchema = z.looseObject({
  uuid: z.string(),
  name: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  model: z.string().nullable().optional(),
  project_uuid: z.string().nullable().optional(),
  current_leaf_message_uuid: z.string().nullable().optional(),
  chat_messages: z.array(ClaudeMessageSchema),
});
export type ClaudeConversation = z.infer<typeof ClaudeConversationSchema>;

export const ClaudeListSchema = z.array(
  z.looseObject({
    uuid: z.string(),
    name: z.string().nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    project_uuid: z.string().nullable().optional(),
    is_starred: z.boolean().optional(),
  }),
);

export const ClaudeProjectSchema = z.looseObject({
  uuid: z.string(),
  name: z.string(),
  prompt_template: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const ClaudeProjectDocSchema = z.looseObject({
  uuid: z.string(),
  file_name: z.string(),
  content: z.string().optional(),
});

const UsageWindowSchema = z
  .looseObject({
    utilization: z.number().nullable().optional(),
    resets_at: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

export const ClaudeUsageSchema = z.looseObject({
  five_hour: UsageWindowSchema,
  seven_day: UsageWindowSchema,
  seven_day_opus: UsageWindowSchema,
});
export type ClaudeUsage = z.infer<typeof ClaudeUsageSchema>;
