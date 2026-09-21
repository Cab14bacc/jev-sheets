/**
 * Confidence policy shared by every tool: act when sure, suggest when unsure,
 * skip otherwise, so the failure mode is "no worse than without the tool".
 * See https://docs.typesafe.ai/confidence.md
 */

export type Band = "act" | "suggest" | "skip";

export interface Thresholds {
  /** At or above this, act automatically. */
  act: number;
  /** At or above this (and below `act`), suggest to the user. */
  suggest: number;
}

export function validateThresholds(t: Thresholds): Thresholds {
  const ok = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
  if (!ok(t.act) || !ok(t.suggest)) throw new RangeError("Thresholds must be between 0 and 1.");
  if (t.suggest > t.act) throw new RangeError("The suggest threshold cannot exceed the act threshold.");
  return t;
}

export function band(value: number, t: Thresholds): Band {
  if (value >= t.act) return "act";
  if (value >= t.suggest) return "suggest";
  return "skip";
}
