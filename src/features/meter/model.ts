// Turns a conversation, token counts and a limit into what the meter shows.
import type { Conversation, Message } from '../../core/schema/archive';
import { activeBranch } from '../../core/model/tree';
import { exchangesLeft, levelFor, toExchanges, type Level, type Thresholds } from '../../core/meter/meter';
import type { LimitResult } from '../../core/limits/limits';

export interface MessageCost {
  id: string;
  index: number;
  role: Message['role'];
  tokens: number;
  snippet: string;
}

export interface Breakdown {
  user: number;
  assistant: number;
  toolsAndCode: number;
  attachments: number;
  draft: number;
  /** Images and files the site counts but we can't measure. */
  unmeasuredFiles: number;
}

export interface MeterState {
  used: number;
  limit: LimitResult;
  percent: number | null;
  level: Level;
  approximate: boolean;
  exchangesLeft: number | null;
  breakdown: Breakdown;
  messages: MessageCost[];
  /** Running total after each message, for the growth sparkline. */
  cumulative: number[];
  model: string | null;
  source: Conversation['source']['method'] | 'site';
}

/** The texts to count for one message, split by category. Thinking is excluded: sites drop it from later turns. */
export function messageTexts(conv: Conversation, m: Message): { prose: string; toolCode: string; attachment: string; files: number } {
  const prose: string[] = [];
  const tool: string[] = [];
  for (const p of m.parts) {
    if (p.type === 'text') prose.push(p.text);
    else if (p.type === 'math') prose.push(p.tex);
    else if (p.type === 'code') tool.push(p.code);
    else if (p.type === 'tool_call') tool.push(p.input, p.output ?? '');
  }
  for (const id of m.artifactIds) {
    const a = conv.artifacts.find((x) => x.id === id && x.messageId === m.id);
    if (a) tool.push(a.versions[a.versions.length - 1]!.content);
  }
  const att: string[] = [];
  let files = 0;
  for (const id of m.attachmentIds) {
    const a = conv.attachments.find((x) => x.id === id);
    if (a?.extractedText) att.push(a.extractedText);
    else if (a) files++;
  }
  return { prose: prose.join('\n\n'), toolCode: tool.filter(Boolean).join('\n\n'), attachment: att.join('\n\n'), files };
}

export interface MeterInputs {
  conv: Conversation;
  /** Token counter (already calibrated by the caller if needed). */
  count: (texts: string[]) => Promise<number[]>;
  limit: LimitResult;
  approximate: boolean;
  thresholds: Thresholds;
  draft: number;
  /** Site-reported used count (AI Studio), replaces our total when present. */
  siteUsed?: number | null;
}

export async function computeMeter(i: MeterInputs): Promise<MeterState> {
  const branch = activeBranch(i.conv).filter((m) => !m.hidden);
  const texts = branch.map((m) => messageTexts(i.conv, m));
  const flat: string[] = [];
  for (const t of texts) flat.push(t.prose, t.toolCode, t.attachment);
  const counts = await i.count(flat);
  const b: Breakdown = { user: 0, assistant: 0, toolsAndCode: 0, attachments: 0, draft: i.draft, unmeasuredFiles: 0 };
  const messages: MessageCost[] = [];
  const cumulative: number[] = [];
  let running = 0;
  branch.forEach((m, idx) => {
    const [prose, tool, att] = [counts[idx * 3]!, counts[idx * 3 + 1]!, counts[idx * 3 + 2]!];
    if (m.role === 'user') b.user += prose;
    else b.assistant += prose;
    b.toolsAndCode += tool;
    b.attachments += att;
    b.unmeasuredFiles += texts[idx]!.files;
    const total = prose + tool + att;
    running += total;
    cumulative.push(running);
    const snippet = texts[idx]!.prose.replace(/\s+/g, ' ').trim().slice(0, 80) || (texts[idx]!.toolCode ? '(code / tool output)' : '(no text)');
    messages.push({ id: m.id, index: idx, role: m.role, tokens: total, snippet });
  });
  const conversationTokens = running;
  const used = (i.siteUsed ?? conversationTokens) + i.draft;
  const percent = i.limit.tokens ? (used / i.limit.tokens) * 100 : null;
  return {
    used,
    limit: i.limit,
    percent,
    level: levelFor(percent, i.thresholds),
    approximate: i.approximate,
    exchangesLeft: exchangesLeft(used, i.limit.tokens, toExchanges(messages)),
    breakdown: b,
    messages,
    cumulative,
    model: i.conv.model ?? null,
    source: i.siteUsed != null ? 'site' : i.conv.source.method,
  };
}

export function heaviest(messages: MessageCost[], n = 10): MessageCost[] {
  return [...messages].sort((a, b) => b.tokens - a.tokens).slice(0, n);
}
