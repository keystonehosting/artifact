// Page-world hook (data source 1 in SPEC §5). Runs in the page's own JS world
// at document_start and copies the responses the page already loads for the
// conversation on screen, so Artifact needs no extra requests. It forwards
// copies to Artifact's isolated content script with window.postMessage. It
// never changes requests or responses. Everything it forwards is treated as
// untrusted data and validated with Zod on the other side.
import { TIER1_HOST_PERMISSIONS } from '../core/sites/hosts';
import { HOOK_SOURCE, matchCapture, type HookMessage } from '../core/intercept/patterns';

const MAX_BODY = 32 * 1024 * 1024;

export default defineContentScript({
  matches: [...TIER1_HOST_PERMISSIONS],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const w = window as Window & { __artifactHook?: boolean };
    if (w.__artifactHook) return;
    w.__artifactHook = true;

    const post = (msg: Omit<HookMessage, 'source'>) => {
      window.postMessage({ source: HOOK_SOURCE, ...msg }, window.location.origin);
    };

    const absolute = (u: string) => {
      try {
        return new URL(u, window.location.href).href;
      } catch {
        return u;
      }
    };

    // ---- fetch ----
    const origFetch = window.fetch;
    window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const url = absolute(input instanceof Request ? input.url : String(input));
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      captureAuth(input, init);
      const res = await origFetch.call(this as typeof globalThis, input, init);
      const kind = matchCapture(url, method);
      if (kind && res.ok) {
        const type = res.headers.get('content-type') ?? '';
        const clone = res.clone();
        if (type.includes('text/event-stream')) {
          void readStream(clone, url, kind);
        } else {
          void clone
            .text()
            .then((body) => {
              if (body.length <= MAX_BODY) post({ kind, url, method, status: res.status, body });
            })
            .catch(() => undefined);
        }
      }
      return res;
    } as typeof window.fetch;

    // ChatGPT's own requests carry the session bearer token; keep the latest
    // in memory so Artifact's reads use the same identity as the page.
    function captureAuth(input: RequestInfo | URL, init?: RequestInit) {
      if (!window.location.hostname.endsWith('chatgpt.com') && !window.location.hostname.endsWith('openai.com')) return;
      let auth: string | null = null;
      let account: string | null = null;
      const h = init?.headers ?? (input instanceof Request ? input.headers : undefined);
      if (h instanceof Headers) {
        auth = h.get('authorization');
        account = h.get('chatgpt-account-id');
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) {
          if (k.toLowerCase() === 'authorization') auth = v;
          if (k.toLowerCase() === 'chatgpt-account-id') account = v;
        }
      } else if (h) {
        for (const [k, v] of Object.entries(h)) {
          if (k.toLowerCase() === 'authorization') auth = v;
          if (k.toLowerCase() === 'chatgpt-account-id') account = v;
        }
      }
      if (auth?.startsWith('Bearer ') && auth.length > 20) post({ kind: 'auth', url: '', method: '', status: 0, body: JSON.stringify({ auth, account }) });
    }

    // Streams (Claude's completion SSE) are read in parallel on a copy; only
    // the usage frames are forwarded, never message text.
    async function readStream(res: Response, url: string, kind: string) {
      if (kind !== 'claude.completion' || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith('data:') && line.includes('"message_limit"')) {
            post({ kind: 'claude.message_limit', url, method: 'POST', status: res.status, body: line.slice(5).trim() });
          }
        }
      }
      post({ kind: 'claude.stream_end', url, method: 'POST', status: res.status, body: '' });
    }

    // ---- XHR (Google sites use it for batchexecute and AI Studio RPCs) ----
    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    XHR.open = function (this: XMLHttpRequest & { __artifactUrl?: string; __artifactMethod?: string }, method: string, url: string | URL, ...rest: unknown[]) {
      this.__artifactUrl = absolute(String(url));
      this.__artifactMethod = method.toUpperCase();
      return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XHR.open;
    XHR.send = function (this: XMLHttpRequest & { __artifactUrl?: string; __artifactMethod?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
      const url = this.__artifactUrl ?? '';
      const method = this.__artifactMethod ?? 'GET';
      const kind = matchCapture(url, method);
      if (kind) {
        this.addEventListener('load', () => {
          if (this.status < 200 || this.status >= 300) return;
          if (this.responseType !== '' && this.responseType !== 'text') return;
          const text = this.responseText;
          if (text.length <= MAX_BODY) post({ kind, url, method, status: this.status, body: text });
        });
      }
      return origSend.call(this, body);
    };
  },
});
