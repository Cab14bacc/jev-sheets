import {
  buildHttpRequest,
  choice,
  DEFAULT_RETRY,
  JevError,
  noul,
  parseHttpResponse,
  retryDelayMs,
  score,
  type Answer,
  type HttpRequest,
  type JsonValue,
  type Question,
} from "./core";

/** Everything the functions need from Apps Script, injected so the logic is testable in Node. */
export interface SheetsEnv {
  getApiKey(): string | null;
  getModel(): string;
  fetchAll(requests: HttpRequest[]): { status: number; body: string; retryAfter: string | null }[];
  cacheGetAll(keys: string[]): Record<string, string>;
  cachePutAll(values: Record<string, string>): void;
  sleep(ms: number): void;
  hash(text: string): string;
}

type Cell = string | number | boolean | Date | null | undefined;
export type CellInput = Cell | Cell[][];
type CellOutput = string | number | boolean;

export const UNSURE = "UNSURE";
/** Sheets ranges above this size risk the 30-second custom-function limit. */
export const MAX_CELLS = 1000;
/** UrlFetchApp.fetchAll batch size; keeps each burst well under 1,200 requests/minute. */
const FETCH_CHUNK = 50;

// ---------------------------------------------------------------- public API

export function jevIf(env: SheetsEnv, text: CellInput, question: Cell, threshold?: Cell) {
  const q = requireText(question, "question");
  const t = threshold === undefined || threshold === null || threshold === "" ? 0.5 : Number(threshold);
  if (!(t >= 0 && t <= 1)) throw new Error("threshold must be a number between 0 and 1.");
  return evaluateCells(env, text, noul(q), (a) => asNoul(a) >= t);
}

export function jevProb(env: SheetsEnv, text: CellInput, question: Cell) {
  const q = requireText(question, "question");
  return evaluateCells(env, text, noul(q), (a) => round(asNoul(a), 4));
}

export function jevChoice(
  env: SheetsEnv,
  text: CellInput,
  options: CellInput,
  question?: Cell,
  minConfidence?: Cell,
) {
  const opts = parseList(options);
  if (opts.includes(UNSURE)) throw new Error(`"${UNSURE}" is reserved; rename that option.`);
  const q = optionalText(question) ?? "Which option best describes the text?";
  const min = parseConfidence(minConfidence);
  return evaluateCells(env, text, choice(q, opts), (a) => {
    if (a.type !== "choice") throw new JevError("Expected a choice answer.", 200, false);
    return a.confidence >= min ? a.choice : UNSURE;
  });
}

/** Returns the level as a 1-based number (1 = first level), e.g. 2.3 is "between level 2 and 3". */
export function jevScore(
  env: SheetsEnv,
  text: CellInput,
  question: Cell,
  levels: CellInput,
  minConfidence?: Cell,
) {
  const q = requireText(question, "question");
  const min = parseConfidence(minConfidence);
  return evaluateCells(env, text, score(q, parseList(levels)), (a) => {
    if (a.type !== "score") throw new JevError("Expected a score answer.", 200, false);
    return a.confidence >= min ? round(a.score + 1, 2) : UNSURE;
  });
}

// ---------------------------------------------------------------- engine

const QUESTION_ID = "q";

/**
 * Splits the input into items, one Jev state each:
 * - a single cell or a single column → one item per cell (state = the text);
 * - several columns → one item per row (state = that row's non-empty cells),
 *   so e.g. A2:C100 judges each product by its name, description and price together.
 * Returns a grid of states (null = blank) in the output shape.
 */
function toItems(input: CellInput): { items: (JsonValue | null)[][]; isRange: boolean } {
  if (!Array.isArray(input)) {
    const text = cellText(input as Cell);
    return { items: [[text || null]], isRange: false };
  }
  const grid = input as Cell[][];
  const multiColumn = grid.some((row) => row.length > 1);
  if (!multiColumn) {
    return { items: grid.map((row) => [cellText(row[0]) || null]), isRange: true };
  }
  return {
    items: grid.map((row) => {
      const texts = row.map(cellText).filter(Boolean);
      return [texts.length === 0 ? null : texts.length === 1 ? texts[0] : texts];
    }),
    isRange: true,
  };
}

/**
 * Evaluates one question against every item. Deduplicates identical items,
 * serves repeats from cache (recalculation is free), fetches the rest in
 * parallel batches with retry, and maps answers back onto the output shape.
 */
function evaluateCells(
  env: SheetsEnv,
  input: CellInput,
  question: Question,
  toCell: (answer: Answer) => CellOutput,
): CellOutput | CellOutput[][] {
  if (Array.isArray(input)) {
    const cellCount = (input as Cell[][]).reduce((n, row) => n + row.length, 0);
    if (cellCount > MAX_CELLS) {
      throw new Error(`Range has ${cellCount} cells; the limit per formula is ${MAX_CELLS}. Split it up.`);
    }
  }
  const { items, isRange } = toItems(input);

  const apiKey = env.getApiKey();
  if (!apiKey) throw new Error("No TypeSafe API key. Add one in Extensions → (this add-on) → Settings & API key.");
  const model = env.getModel();
  const questionJson = JSON.stringify(question);

  // Unique non-blank items (by their JSON) → cache key
  const stateById = new Map<string, JsonValue>();
  const keyById = new Map<string, string>();
  for (const row of items) {
    for (const state of row) {
      if (state === null) continue;
      const id = JSON.stringify(state);
      if (!keyById.has(id)) {
        stateById.set(id, state);
        keyById.set(id, "jev:" + env.hash(`${model}\n${questionJson}\n${id}`));
      }
    }
  }

  const answers = new Map<string, Answer | Error>();
  const cached = env.cacheGetAll([...keyById.values()]);
  const misses: string[] = [];
  for (const [id, key] of keyById) {
    if (cached[key]) answers.set(id, JSON.parse(cached[key]) as Answer);
    else misses.push(id);
  }

  for (let i = 0; i < misses.length; i += FETCH_CHUNK) {
    const chunk = misses.slice(i, i + FETCH_CHUNK);
    const fetched = fetchWithRetry(env, apiKey, model, question, chunk.map((id) => stateById.get(id)!));
    const toCache: Record<string, string> = {};
    chunk.forEach((id, j) => {
      const result = fetched[j];
      answers.set(id, result);
      if (!(result instanceof Error)) toCache[keyById.get(id)!] = JSON.stringify(result);
    });
    if (Object.keys(toCache).length) env.cachePutAll(toCache);
  }

  const out = items.map((row) =>
    row.map((state): CellOutput => {
      if (state === null) return "";
      const answer = answers.get(JSON.stringify(state))!;
      if (answer instanceof Error) {
        // A bad key fails every cell; surface it once as a formula error instead.
        if (answer instanceof JevError && answer.status === 401) throw answer;
        return `#JEV ${answer.message}`;
      }
      try {
        return toCell(answer);
      } catch (e) {
        return `#JEV ${(e as Error).message}`;
      }
    }),
  );
  return isRange ? out : out[0][0];
}

function fetchWithRetry(
  env: SheetsEnv,
  apiKey: string,
  model: string,
  question: Question,
  states: JsonValue[],
): (Answer | Error)[] {
  const requests = states.map((state) =>
    buildHttpRequest(apiKey, { state, model, questions: { [QUESTION_ID]: question } }),
  );
  const results: (Answer | Error)[] = new Array(states.length);
  let pending = states.map((_, i) => i);

  for (let attempt = 1; pending.length; attempt++) {
    const responses = env.fetchAll(pending.map((i) => requests[i]));
    const retry: number[] = [];
    let delay = 0;
    pending.forEach((index, j) => {
      const { status, body, retryAfter } = responses[j];
      try {
        results[index] = parseHttpResponse(status, body, [QUESTION_ID]).answers[QUESTION_ID];
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        results[index] = err;
        if (err instanceof JevError && err.retryable && attempt < DEFAULT_RETRY.maxAttempts) {
          retry.push(index);
          delay = Math.max(delay, retryDelayMs(attempt, retryAfter));
        }
      }
    });
    pending = retry;
    if (pending.length) env.sleep(delay);
  }
  return results;
}

// ---------------------------------------------------------------- helpers

function asNoul(a: Answer): number {
  if (a.type !== "noul") throw new JevError("Expected a yes/no answer.", 200, false);
  return a.noul;
}

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

function requireText(value: Cell, name: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function optionalText(value: Cell): string | undefined {
  const text = cellText(value);
  return text || undefined;
}

/** A range (any shape) or a comma-separated string → unique, non-empty list. */
export function parseList(value: CellInput): string[] {
  const raw = Array.isArray(value)
    ? value.flat().map(cellText)
    : cellText(value).split(",").map((s) => s.trim());
  const list = raw.filter(Boolean);
  const dupes = list.filter((v, i) => list.indexOf(v) !== i);
  if (dupes.length) throw new Error(`Duplicate option: "${dupes[0]}".`);
  return list;
}

function parseConfidence(value: Cell): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!(n >= 0 && n <= 1)) throw new Error("min_confidence must be between 0 and 1.");
  return n;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
