import { beforeEach, describe, expect, it } from 'vitest';
import { ArtifactDB, db, setDb } from '../../src/core/db/db';
import * as P from '../../src/core/prompts/service';
import { Runner } from '../../src/features/prompts/runner';
import { findTrigger } from '../../src/features/prompts/triggers';
import { enhanceRequest, extractEnhanced } from '../../src/features/prompts/enhancer';
import { countText, profileText } from '../../src/features/prompts/composer-bar';
import type { SiteAdapter } from '../../src/adapters/types';
import starter from '../../src/core/prompts/starter-pack.json';

let n = 0;
beforeEach(() => setDb(new ArtifactDB(`prompts-${++n}`)));

describe('prompt library', () => {
  it('validates, saves, sorts pinned first and counts uses', async () => {
    await expect(P.savePrompt({ name: ' ', body: 'x' })).rejects.toThrow(/name/);
    await expect(P.savePrompt({ name: 'x', body: '' })).rejects.toThrow(/text/);
    const a = await P.savePrompt({ name: 'Beta', body: 'b' });
    const b = await P.savePrompt({ name: 'Alpha', body: 'a', pinned: 1 });
    await P.usePrompt(a.id);
    await P.usePrompt(a.id);
    expect((await P.listPrompts('az')).map((p) => p.name)).toEqual(['Alpha', 'Beta']);
    expect((await P.listPrompts('used')).map((p) => p.id)).toEqual([b.id, a.id]);
    expect((await db().prompts.get(a.id))!.uses).toBe(2);
  });

  it('adds the starter pack once', async () => {
    expect(await P.importStarter()).toBe(starter.items.length);
    expect(await P.importStarter()).toBe(0);
    expect(await db().prompts.count()).toBe(starter.items.length);
  });

  it('exports and imports prompts and chains, skipping duplicates', async () => {
    await P.savePrompt({ name: 'One', body: 'Hello {{who}}', category: 'work', favorite: 1 });
    await P.saveChain({ name: 'C', steps: [{ name: '', text: 's1', after: 'reply' }] });
    const json = await P.exportPrompts();
    setDb(new ArtifactDB(`prompts-${++n}`));
    expect(await P.importPrompts(json)).toEqual({ prompts: 1, chains: 1 });
    expect(await P.importPrompts(json)).toEqual({ prompts: 0, chains: 0 });
    const [p] = await P.listPrompts();
    expect(p).toMatchObject({ name: 'One', category: 'work', favorite: 1 });
    expect(await P.importPrompts('Plain body', 'notes.md')).toEqual({ prompts: 1, chains: 0 });
    expect((await P.listPrompts('az')).map((x) => x.name)).toContain('notes');
    await expect(P.importPrompts('{"other":1}', 'x.json')).rejects.toThrow(/not an Artifact prompts file/);
  });

  it('splits pasted steps and validates chains', async () => {
    expect(P.splitSteps('one\n---\ntwo\n  ---  \nthree')).toEqual(['one', 'two', 'three']);
    await expect(P.saveChain({ name: 'x', steps: [{ name: '', text: ' ', after: 'reply' }] })).rejects.toThrow(/at least one step/);
  });

  it('keeps history per site without repeats, and the last 20 handoffs', async () => {
    await P.addHistory('claude', 'a');
    await P.addHistory('claude', 'a');
    await P.addHistory('claude', 'b');
    await P.addHistory('chatgpt', 'c');
    expect((await P.history('claude')).map((h) => h.text)).toEqual(['b', 'a']);
    for (let i = 0; i < 25; i++) await P.addHandoff({ fromChatId: null, fromTitle: `t${i}`, fromSite: 'claude', targetSite: 'chatgpt', mode: 'local', text: 'x' });
    expect(await db().handoffs.count()).toBe(20);
  });

  it('picks the same prompt of the day all day, favorites first', async () => {
    const a = await P.savePrompt({ name: 'A', body: 'a' });
    await P.savePrompt({ name: 'B', body: 'b' });
    const day = new Date(2026, 4, 1, 9);
    const first = await P.promptOfTheDay(day);
    expect((await P.promptOfTheDay(new Date(2026, 4, 1, 22)))!.id).toBe(first!.id);
    await P.savePrompt({ ...a, favorite: 1 });
    expect((await P.promptOfTheDay(day))!.id).toBe(a.id);
  });

  it('stores drafts and removes empty ones', async () => {
    await P.setDraft('claude:x', 'half typed');
    expect((await db().drafts.get('claude:x'))!.text).toBe('half typed');
    await P.setDraft('claude:x', '  ');
    expect(await db().drafts.get('claude:x')).toBeUndefined();
  });
});

describe('composer helpers', () => {
  it('finds triggers only at the end, after whitespace', () => {
    expect(findTrigger('//sum')).toEqual({ kind: 'prompt', query: 'sum', before: '' });
    expect(findTrigger('Please ..two')).toEqual({ kind: 'chain', query: 'two', before: 'Please ' });
    expect(findTrigger('see @@trip plan')).toEqual({ kind: 'mention', query: 'trip plan', before: 'see ' });
    expect(findTrigger('http://x')).toBeNull();
    expect(findTrigger('end.. ')).toBeNull();
    expect(findTrigger('a.b..c')).toBeNull();
  });

  it('builds and reads enhancer messages', () => {
    expect(enhanceRequest('Improve it.', ' draft ')).toBe('Improve it.\n\n"""\ndraft\n"""');
    expect(extractEnhanced('```\nBetter prompt\n```')).toBe('Better prompt');
    expect(extractEnhanced('"Better prompt"')).toBe('Better prompt');
    expect(extractEnhanced('Better prompt')).toBe('Better prompt');
  });

  it('formats the profile and counts words', () => {
    expect(profileText({ about: 'I teach.', instructions: '' })).toBe('About me:\nI teach.');
    expect(profileText({ about: '', instructions: '' })).toBe('');
    expect(countText('  two words ')).toEqual({ chars: 9, words: 2 });
  });
});

/** A page that "replies" a moment after each send. */
function fakeAdapter() {
  let draft = '';
  let streaming = false;
  const sent: string[] = [];
  const a = {
    isStreaming: () => streaming,
    getDraftText: () => draft,
    fillComposer: async (t: string) => ((draft = t), true),
    submit: async () => {
      sent.push(draft);
      draft = '';
      streaming = true;
      setTimeout(() => (streaming = false), 30);
      return true;
    },
  } as unknown as SiteAdapter;
  return { a, sent };
}

const fast = { startMs: 300, replyMs: 2000, gapMs: 5, pollMs: 5 };

describe('chain runner', () => {
  it('sends each step after the previous reply and reports done', async () => {
    const { a, sent } = fakeAdapter();
    const r = new Runner(a, fast);
    const phases: string[] = [];
    r.subscribe((s) => s && phases.push(s.phase));
    r.start('c', [
      { name: '', text: 'one', after: 'reply' },
      { name: '', text: 'two', after: 'reply' },
    ]);
    await new Promise((res) => setTimeout(res, 400));
    expect(sent).toEqual(['one', 'two']);
    expect(phases.at(-1)).toBe('done');
  });

  it('waits for the user on confirm steps and can stop', async () => {
    const { a, sent } = fakeAdapter();
    const r = new Runner(a, fast);
    r.start('c', [
      { name: '', text: 'one', after: 'confirm' },
      { name: '', text: 'two', after: 'reply' },
    ]);
    await new Promise((res) => setTimeout(res, 200));
    expect(sent).toEqual(['one']);
    expect(r.current?.phase).toBe('confirm');
    r.resume();
    await new Promise((res) => setTimeout(res, 200));
    expect(sent).toEqual(['one', 'two']);
    r.start('c2', [{ name: '', text: 'x', after: 'confirm' }, { name: '', text: 'y', after: 'reply' }]);
    await new Promise((res) => setTimeout(res, 150));
    r.stop();
    await new Promise((res) => setTimeout(res, 150));
    expect(sent).toEqual(['one', 'two', 'x']);
  });

  it('queues texts behind a running item and times out when nothing is sent', async () => {
    const { a, sent } = fakeAdapter();
    const r = new Runner(a, fast);
    r.enqueue('q1');
    r.enqueue('q2');
    await new Promise((res) => setTimeout(res, 700));
    expect(sent).toEqual(['q1', 'q2']);
    const stuck = { isStreaming: () => false, getDraftText: () => 'still here', fillComposer: async () => true, submit: async () => true } as unknown as SiteAdapter;
    const r2 = new Runner(stuck, fast);
    r2.start('c', [{ name: '', text: 'z', after: 'reply' }]);
    await new Promise((res) => setTimeout(res, 500));
    expect(r2.current?.phase).toBe('timeout');
  });
});
