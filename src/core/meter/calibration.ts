// Per-provider calibration of the o200k estimate (SPEC §6A). ChatGPT uses
// o200k natively, so its factor is exactly 1. Other providers start at 1 and
// learn a factor wherever a site reports its own count (AI Studio does).
import type { SiteId } from '../sites/sites';

export interface Calibration {
  factor: number;
  samples: number;
  updatedAt: number;
}

/** Sites that share one tokenizer family share a calibration key. */
export function calibrationKey(site: SiteId): string {
  return site === 'aistudio' || site === 'gemini' ? 'google' : site;
}

export function isExact(site: SiteId): boolean {
  return site === 'chatgpt';
}

const MIN_TOKENS = 200;
const ALPHA = 0.3;

/**
 * Folds one observation into the factor with an exponential moving average.
 * Observations from tiny prompts are ignored (too noisy), as are implausible
 * ratios (a sign the two counts are not measuring the same text).
 */
export function updateCalibration(prev: Calibration | null, ours: number, theirs: number, now = Date.now()): Calibration | null {
  if (ours < MIN_TOKENS || theirs <= 0) return prev;
  const ratio = theirs / ours;
  if (ratio < 0.5 || ratio > 2) return prev;
  if (!prev) return { factor: ratio, samples: 1, updatedAt: now };
  return { factor: prev.factor * (1 - ALPHA) + ratio * ALPHA, samples: prev.samples + 1, updatedAt: now };
}

export function applyCalibration(tokens: number, cal: Calibration | null): number {
  return Math.round(tokens * (cal?.factor ?? 1));
}
