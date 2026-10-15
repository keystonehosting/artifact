import { test, expect, openSite, sendToTab, SITE_FIXTURES } from './fixtures';

type ReadRes = { conversation: { title: string; messages: Record<string, { role: string }>; source: { method: string } } | null; health: { state: string } };

for (const site of Object.keys(SITE_FIXTURES)) {
  test(`content script reads the ${site} page`, async ({ context, extPage }) => {
    const { tabId } = await openSite(context, extPage, site);
    const res = await sendToTab<ReadRes>(extPage, tabId, { type: 'content:read' });
    expect(res.conversation).not.toBeNull();
    const roles = Object.values(res.conversation!.messages).map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(res.conversation!.source.method).toBe('dom');
  });
}

test('self-test reports per-check results without message text', async ({ context, extPage }) => {
  const { tabId } = await openSite(context, extPage, 'chatgpt');
  const res = await sendToTab<{ health: { checks: Array<{ id: string; ok: boolean; detail: string }> } }>(extPage, tabId, { type: 'content:selftest' });
  const ids = res.health.checks.map((c) => c.id);
  expect(ids).toContain('dom.turns');
  expect(ids).toContain('chatgpt.composer');
});
