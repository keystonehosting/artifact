// A small conversation with a fork, code, math, an image and an artifact,
// used across export tests. Text is lorem ipsum.
import type { Conversation } from '../../src/core/schema/archive';

export function sampleConversation(): Conversation {
  return {
    id: 'claude:11111111-1111-1111-1111-111111111111',
    site: 'claude',
    siteChatId: '11111111-1111-1111-1111-111111111111',
    url: 'https://claude.ai/chat/11111111-1111-1111-1111-111111111111',
    title: 'Lorem ipsum: dolor',
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T04:00:00.000Z',
    model: 'model-x',
    project: null,
    rootIds: ['u1'],
    currentLeafId: 'a2b',
    messages: {
      u1: { id: 'u1', parentId: null, childIds: ['a1'], role: 'user', createdAt: '2026-01-02T03:04:05.000Z', parts: [{ type: 'text', text: 'Lorem ipsum dolor sit amet?' }], attachmentIds: ['f1'], artifactIds: [] },
      a1: {
        id: 'a1', parentId: 'u1', childIds: ['u2', 'u2b'], role: 'assistant', model: 'model-x', createdAt: '2026-01-02T03:04:10.000Z',
        parts: [
          { type: 'thinking', text: 'Consectetur.' },
          { type: 'text', text: 'Sed do eiusmod \\(x^2\\) tempor.' },
          { type: 'code', language: 'ts', code: 'const a = "```";' },
          { type: 'math', tex: 'E = mc^2', display: true },
          { type: 'artifact_ref', artifactId: 'art1' },
        ],
        attachmentIds: [], artifactIds: ['art1'],
      },
      u2: { id: 'u2', parentId: 'a1', childIds: ['a2'], role: 'user', parts: [{ type: 'text', text: 'Ut enim ad minim?' }], attachmentIds: [], artifactIds: [] },
      a2: { id: 'a2', parentId: 'u2', childIds: [], role: 'assistant', parts: [{ type: 'text', text: 'Veniam quis.' }], attachmentIds: [], artifactIds: [] },
      u2b: { id: 'u2b', parentId: 'a1', childIds: ['a2b'], role: 'user', parts: [{ type: 'text', text: 'Duis aute irure?' }], attachmentIds: [], artifactIds: [] },
      a2b: { id: 'a2b', parentId: 'u2b', childIds: [], role: 'assistant', parts: [{ type: 'text', text: 'Excepteur sint.' }, { type: 'image', attachmentId: 'img1', alt: 'chart' }], attachmentIds: ['img1'], artifactIds: [] },
    },
    attachments: [
      { id: 'f1', messageId: 'u1', kind: 'upload', name: 'notes.pdf', mimeType: 'application/pdf', size: 1234, ref: { uuid: 'f1' } },
      { id: 'img1', messageId: 'a2b', kind: 'generated', name: 'chart.png', mimeType: 'image/png', ref: { url: 'https://example.test/c.png' } },
    ],
    artifacts: [
      { id: 'art1', messageId: 'a1', kind: 'claude-artifact', title: 'Demo page', type: 'text/html', versions: [{ content: '<p>v1</p>' }, { content: '<p>v2</p>' }] },
    ],
    source: { method: 'endpoint', approximate: false, capturedAt: '2026-01-02T05:00:00.000Z' },
    metadata: {},
  };
}
