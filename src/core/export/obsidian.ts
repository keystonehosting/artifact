// "Send to Obsidian" through Obsidian's URI scheme (SPEC §6I, ACE parity).
// Long notes are passed through the clipboard, because very long URIs are
// truncated by some systems; Obsidian's `clipboard` parameter reads it.
const MAX_URI = 30_000;

export function obsidianUri(vault: string, folder: string, name: string, markdown: string): string {
  const file = `${folder ? `${folder.replace(/\/+$/, '')}/` : ''}${name.replace(/[\\/:*?"<>|#^[\]]/g, '')}`;
  const q = new URLSearchParams({ vault, file });
  if (markdown.length <= MAX_URI) q.set('content', markdown);
  else q.set('clipboard', 'true');
  return `obsidian://new?${q.toString().replace(/\+/g, '%20')}`;
}

export function obsidianNeedsClipboard(markdown: string): boolean {
  return markdown.length > MAX_URI;
}
