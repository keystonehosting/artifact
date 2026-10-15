// Carrying a chat into a new one (SPEC §6I): the local handoff summary, the
// prompt for "current chat" mode, the seed text placed in the destination
// composer, and `@@` mention blocks. Everything here is local text work.
import type { Conversation, Message } from '../schema/archive';
import { activeBranch, messageText } from '../model/tree';

export type Count = (text: string) => number | Promise<number>;

/** Keeps the start and end of a long text with a gap marker between them. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = Math.floor((max - 5) * 0.6);
  const tail = max - 5 - head;
  return `${t.slice(0, head).trimEnd()} […] ${t.slice(t.length - tail).trimStart()}`;
}

function sentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*>\d.)\s]+/, '').trim())
    .filter((s) => s.length > 8 && s.length < 400);
}

const CONSTRAINT = /\b(must|mustn't|should(?:n't| not)?|don't|do not|never|always|avoid|only|without|no more than|at most|at least|required?|make sure|keep it)\b/i;
const DECISION = /\b(decided|let's (?:go with|use|keep)|we(?:'ll| will) (?:use|go with|keep)|going with|settled on|final (?:answer|choice|version)|agreed|chose|chosen)\b/i;

function uniq(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function codeBlocks(msgs: Message[]): Array<{ lang: string; code: string }> {
  const out: Array<{ lang: string; code: string }> = [];
  for (const m of [...msgs].reverse()) {
    for (const p of [...m.parts].reverse()) {
      if (p.type === 'code' && p.code.trim()) out.push({ lang: p.language ?? '', code: p.code.trimEnd() });
      if (p.type === 'text') for (const b of [...p.text.matchAll(/```(\w*)\n([\s\S]*?)```/g)].reverse()) out.push({ lang: b[1] ?? '', code: b[2]!.trimEnd() });
    }
  }
  return out;
}

export interface LocalHandoffOptions {
  siteName: string;
  /** Token budget for the whole summary. */
  budget: number;
  count: Count;
}

/**
 * The Local handoff: goal, constraints, decisions, recent code verbatim and
 * the last three exchanges, with a link back, cut down until it fits the
 * token budget.
 */
export async function localHandoff(conv: Conversation, o: LocalHandoffOptions): Promise<string> {
  const msgs = activeBranch(conv).filter((m) => !m.hidden && (m.role === 'user' || m.role === 'assistant'));
  const users = msgs.filter((m) => m.role === 'user');
  const goal = users[0] ? messageText(users[0]) : '';
  const constraints = uniq(users.flatMap((m) => sentences(messageText(m))).filter((s) => CONSTRAINT.test(s)), 8);
  const decisions = uniq(msgs.flatMap((m) => sentences(messageText(m))).filter((s) => DECISION.test(s)), 6);
  const code = codeBlocks(msgs);
  const last = msgs.slice(-6);

  // Each pass shrinks the parts that are least likely to matter.
  const plans = [
    { goal: 1500, items: 8, code: 3, codeMax: 4000, turn: 1200, turns: 6 },
    { goal: 1200, items: 6, code: 2, codeMax: 2500, turn: 800, turns: 6 },
    { goal: 900, items: 4, code: 1, codeMax: 1500, turn: 500, turns: 4 },
    { goal: 600, items: 3, code: 1, codeMax: 800, turn: 300, turns: 2 },
    { goal: 400, items: 2, code: 0, codeMax: 0, turn: 200, turns: 2 },
    { goal: 300, items: 0, code: 0, codeMax: 0, turn: 120, turns: 1 },
  ];
  let text = '';
  for (const p of plans) {
    const parts: string[] = [];
    parts.push(`Context carried over from "${conv.title || 'an earlier chat'}" on ${o.siteName}${conv.url ? ` (${conv.url})` : ''}.`);
    if (goal) parts.push(`## Goal\n${clip(goal, p.goal)}`);
    if (p.items && constraints.length) parts.push(`## Constraints mentioned\n${constraints.slice(0, p.items).map((s) => `- ${s}`).join('\n')}`);
    if (p.items && decisions.length) parts.push(`## Decisions so far\n${decisions.slice(0, p.items).map((s) => `- ${s}`).join('\n')}`);
    if (p.code && code.length) {
      const blocks = code.slice(0, p.code).reverse().map((c) => `\`\`\`${c.lang}\n${clip(c.code, p.codeMax)}\n\`\`\``);
      parts.push(`## Recent code\n${blocks.join('\n\n')}`);
    }
    const turns = last.slice(-p.turns);
    if (turns.length) parts.push(`## Latest exchanges\n${turns.map((m) => `**${m.role === 'user' ? 'Me' : o.siteName}:** ${clip(messageText(m), p.turn)}`).join('\n\n')}`);
    text = parts.join('\n\n');
    if ((await o.count(text)) <= o.budget) return text;
  }
  return text;
}

/** "Current chat" mode: asks the assistant in this chat to write the handoff. Never sent automatically. */
export function handoffRequest(): string {
  return [
    'Please write a handoff note so I can continue this conversation in a new chat with no access to this one.',
    'Include: the goal, constraints and preferences I stated, decisions we reached, open questions, and any code or text we are still working on (verbatim if short).',
    'Write it as a brief I can paste in, without commentary before or after.',
  ].join('\n');
}

/** Text placed in the destination composer: header, the summary, and room to type. */
export function handoffSeed(summary: string, from: { title: string; siteName: string }, crossSite: boolean): string {
  const head = from.title
    ? `I'm continuing a conversation titled "${from.title}"${crossSite ? ` that started on ${from.siteName}` : ''}. Here is where it stands:`
    : `I'm continuing an earlier conversation${crossSite ? ` from ${from.siteName}` : ''}. Here is where it stands:`;
  return `${head}\n\n${summary.trim()}\n\n---\n\n`;
}

function lines(msgs: Message[], siteName: string, cap: number): string {
  const out: string[] = [];
  let used = 0;
  for (const m of msgs) {
    const label = m.role === 'user' ? 'User' : siteName;
    const body = messageText(m).trim();
    const room = cap - used - label.length - 2;
    if (room <= 20) break;
    const line = `${label}: ${body.length > room ? `${body.slice(0, room - 1)}…` : body}`;
    out.push(line);
    used += line.length + 1;
    if (body.length > room) break;
  }
  return out.join('\n');
}

/**
 * The block an `@@` mention inserts. Short chats go in whole (first 20
 * messages); long ones as an excerpt of the opening and the latest turns.
 */
export function mentionBlock(conv: Conversation, siteName: string, cap = 30_000): string {
  const msgs = activeBranch(conv).filter((m) => !m.hidden && (m.role === 'user' || m.role === 'assistant'));
  const size = msgs.reduce((n, m) => n + messageText(m).length + 15, 0);
  const title = conv.title || 'Untitled chat';
  if (size < 15_000) return `[Context: "${title}" on ${siteName}]\n${lines(msgs.slice(0, 20), siteName, cap)}\n[End of context]\n`;
  const pick = msgs.length <= 8 ? msgs : [...msgs.slice(0, 2), ...msgs.slice(-6)];
  const gap = msgs.length > 8 ? `\n(${msgs.length - 8} messages in between left out)\n` : '\n';
  const head = lines(pick.slice(0, 2), siteName, Math.floor(cap / 3));
  const tail = lines(pick.slice(2), siteName, cap - head.length);
  return `[Context excerpt: "${title}" on ${siteName}, ${msgs.length} messages]\n${head}${gap}${tail}\n[End of context]\n`;
}
