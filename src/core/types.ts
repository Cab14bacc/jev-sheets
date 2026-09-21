// Wire types for POST https://api.typesafe.ai/v1/systemone
// Source: https://docs.typesafe.ai/api.md (checked 2026-09-21, jev-1.13.0)

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Instructions and criteria may be a string, or structured data the question refers to by name. */
export type Text = string | JsonValue[] | { [key: string]: JsonValue };

/** Yes/no question. Answer is the probability of "yes"; no confidence field. */
export interface NoulQuestion {
  type: "noul";
  instructions: Text;
  criteria?: { true?: Text; false?: Text };
}

/** Pick one of up to 255 options. `null` means the option needs no description. */
export interface ChoiceQuestion {
  type: "choice";
  instructions: Text;
  criteria: Record<string, Text | null>;
}

/** Rate along 2–10 ordered levels. */
export interface ScoreQuestion {
  type: "score";
  instructions: Text;
  criteria: Text[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface SystemOneRequest {
  state: JsonValue;
  model: string;
  questions: Record<string, Question>;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  /** Probability-weighted, 0-based level index; may land between levels. */
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneResponse {
  /** Versioned model that answered, e.g. "jev-1.13.0". */
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

/** The request minus `model`, which the client fills in. */
export type Evaluation = Omit<SystemOneRequest, "model">;

/**
 * Anything that can answer typed questions. Hosts depend on this, not on Jev,
 * so the model stays swappable (e.g. an LLM fallback that returns the same shape).
 */
export interface DecisionModel {
  evaluate(evaluation: Evaluation): Promise<SystemOneResponse>;
}
