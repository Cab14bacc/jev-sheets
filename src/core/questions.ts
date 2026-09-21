import type { ChoiceQuestion, NoulQuestion, ScoreQuestion, Text } from "./types";

// API limits from https://docs.typesafe.ai/api.md
export const MAX_CHOICE_OPTIONS = 255;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

export function noul(instructions: Text, criteria?: { true?: Text; false?: Text }): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

/** Accepts a list of options (no descriptions) or an option → description map. */
export function choice(
  instructions: Text,
  options: readonly string[] | Record<string, Text | null>,
): ChoiceQuestion {
  const criteria: Record<string, Text | null> = Array.isArray(options)
    ? Object.fromEntries(options.map((o) => [o, null]))
    : { ...(options as Record<string, Text | null>) };
  const count = Object.keys(criteria).length;
  if (count < 2) throw new RangeError("A choice needs at least 2 options.");
  if (count > MAX_CHOICE_OPTIONS) {
    throw new RangeError(`A choice allows at most ${MAX_CHOICE_OPTIONS} options (got ${count}).`);
  }
  return { type: "choice", instructions, criteria };
}

export function score(instructions: Text, levels: readonly Text[]): ScoreQuestion {
  if (levels.length < MIN_SCORE_LEVELS || levels.length > MAX_SCORE_LEVELS) {
    throw new RangeError(
      `A score needs ${MIN_SCORE_LEVELS}–${MAX_SCORE_LEVELS} levels (got ${levels.length}).`,
    );
  }
  return { type: "score", instructions, criteria: [...levels] };
}
