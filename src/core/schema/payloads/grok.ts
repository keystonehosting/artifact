// grok.com payloads, as read by Loominary (MIT). Not yet confirmed live by
// this project; see docs/provider-notes.md.
import { z } from 'zod';

export const GrokResponseNodesSchema = z.looseObject({
  responseNodes: z.array(
    z.looseObject({
      responseId: z.string(),
      parentResponseId: z.string().nullable().optional(),
      sender: z.string().optional(),
      childResponseIds: z.array(z.string()).optional(),
      threadId: z.string().nullable().optional(),
    }),
  ),
});

export const GrokResponseSchema = z.looseObject({
  responseId: z.string(),
  parentResponseId: z.string().nullable().optional(),
  sender: z.string(),
  message: z.string(),
  createTime: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  thinkingTrace: z.string().nullable().optional(),
  generatedImageUrls: z.array(z.string()).optional(),
  imageAttachments: z.array(z.unknown()).optional(),
  fileAttachments: z.array(z.unknown()).optional(),
  webSearchResults: z.array(z.looseObject({ url: z.string(), title: z.string().optional() })).optional(),
  citations: z.array(z.unknown()).optional(),
});
export type GrokResponse = z.infer<typeof GrokResponseSchema>;

export const GrokLoadResponsesSchema = z.looseObject({
  responses: z.array(GrokResponseSchema),
});

export const GrokConversationMetaSchema = z.looseObject({
  conversation: z
    .looseObject({
      conversationId: z.string(),
      title: z.string().nullable().optional(),
      createTime: z.string().nullable().optional(),
      modifyTime: z.string().nullable().optional(),
    })
    .optional(),
});

export const GrokListSchema = z.looseObject({
  conversations: z.array(
    z.looseObject({
      conversationId: z.string(),
      title: z.string().nullable().optional(),
      createTime: z.string().nullable().optional(),
      modifyTime: z.string().nullable().optional(),
      starred: z.boolean().optional(),
    }),
  ),
  nextPageToken: z.string().nullable().optional(),
});
