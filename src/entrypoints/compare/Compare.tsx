// Broadcast compare view (SPEC §6I): one column per site with its reply to
// the broadcast prompt, refreshed until every reply has finished. The text
// waits in each tab's composer unless the user chose to send automatically.
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { BroadcastJob } from '../../core/crossai/hub';
import { SITES } from '../../core/sites/sites';
import { sendToTab } from '../../core/messaging/tabs';
import { markdownToHtml } from '../../core/export/render';
import { useSettings } from '../../ui/app/hooks';
import { useTheme } from '../../ui/app/theme';
import { t } from '../../core/i18n/t';

type Col = { site: string; tabId: number; state: 'loading' | 'waiting' | 'streaming' | 'done' | 'closed'; reply: string };

export function Compare() {
  const [settings] = useSettings();
  useTheme(settings?.theme ?? 'system');
  const [job, setJob] = useState<BroadcastJob | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [error, setError] = useState('');
  const id = new URLSearchParams(location.search).get('job') ?? '';

  useEffect(() => {
    void browser.runtime.sendMessage({ type: 'bg:job', id }).then((r: { job: BroadcastJob | null }) => {
      if (!r?.job) return setError(t('compare_missing'));
      setJob(r.job);
      setCols(r.job.tabs.map((x) => ({ ...x, state: 'loading', reply: '' })));
    });
  }, [id]);

  useEffect(() => {
    if (!job) return;
    let alive = true;
    const poll = async () => {
      const next = await Promise.all(
        job.tabs.map(async (x): Promise<Col> => {
          try {
            const r = await sendToTab(x.tabId, { type: 'content:last-reply' });
            const state = r.streaming ? 'streaming' : r.reply ? 'done' : 'waiting';
            return { ...x, state, reply: r.reply ?? '' };
          } catch {
            const exists = await browser.tabs.get(x.tabId).then(() => true, () => false);
            return { ...x, state: exists ? 'loading' : 'closed', reply: '' };
          }
        }),
      );
      if (alive) setCols(next);
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job?.id]);

  if (error) return <p class="content status error">{error}</p>;
  if (!job) return null;
  return (
    <div class="app compare">
      <header class="app-head">
        <h1>{t('compare_title')}</h1>
      </header>
      <div class="content">
        <blockquote class="quote">{job.text}</blockquote>
        <div class="columns" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(260px, 1fr))` }}>
          {cols.map((c) => (
            <section class="col">
              <header class="row">
                <h2>{SITES[c.site as keyof typeof SITES]?.name ?? c.site}</h2>
                <span class="muted">{t(`compare_${c.state}`)}</span>
                <button onClick={() => void browser.tabs.update(c.tabId, { active: true })} disabled={c.state === 'closed'}>
                  {t('compare_open')}
                </button>
                <button onClick={() => void navigator.clipboard.writeText(c.reply)} disabled={!c.reply}>
                  {t('compare_copy')}
                </button>
              </header>
              {c.reply ? <div class="reply" dangerouslySetInnerHTML={{ __html: markdownToHtml(c.reply) }} /> : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
