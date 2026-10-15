// Match-pattern check for URLs the background may fetch on a content
// script's behalf: only the AI sites and their file hosts.
export function hostAllowed(url: string, patterns: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return patterns.some((p) => {
    const m = /^https:\/\/([^/]+)(\/.*)$/.exec(p);
    if (!m) return false;
    const host = m[1]!;
    const pathRe = new RegExp(`^${m[2]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const hostOk = host.startsWith('*.') ? u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1)) : u.hostname === host;
    return hostOk && pathRe.test(u.pathname + u.search);
  });
}
