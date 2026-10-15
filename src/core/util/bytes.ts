// Byte helpers for passing file contents through extension messaging, which
// only carries JSON-serializable values.
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  html: 'text/html', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', py: 'text/x-python', js: 'text/javascript', ts: 'text/x-typescript',
};

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

const MIME_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_MIME).map(([e, m]) => [m, e]));

/** Adds an extension matching `mime` when `name` has none. */
export function withExtension(name: string, mime: string): string {
  if (/\.[a-z0-9]{1,5}$/i.test(name)) return name;
  const ext = MIME_EXT[mime.split(';')[0]!.trim()];
  return ext ? `${name}.${ext}` : name;
}
