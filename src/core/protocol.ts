import type { Answer, SystemOneRequest, SystemOneResponse } from "./types";

export const DEFAULT_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_MODEL = "jev-latest";
export const SYSTEM_ONE_PATH = "/v1/systemone";

export interface HttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export function buildHttpRequest(
  apiKey: string,
  request: SystemOneRequest,
  baseUrl: string = DEFAULT_BASE_URL,
): HttpRequest {
  if (!apiKey) throw new JevError("No TypeSafe API key configured.", 401, false);
  return {
    url: baseUrl.replace(/\/+$/, "") + SYSTEM_ONE_PATH,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  };
}

export class JevError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 for network/parse failures. */
    readonly status: number,
    /** True for 429 / 529 / 5xx / network errors: retry with backoff. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "JevError";
  }
}

const STATUS_HINTS: Record<number, string> = {
  401: "Missing or invalid API key",
  422: "Request failed validation",
  429: "Rate limit exceeded",
  529: "TypeSafe is overloaded",
};

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || status === 529 || status >= 500;
}

/** Turns a raw HTTP result into a validated response, or throws JevError. */
export function parseHttpResponse(
  status: number,
  body: string,
  questionIds?: readonly string[],
): SystemOneResponse {
  if (status < 200 || status >= 300) {
    const hint = STATUS_HINTS[status] ?? "Request failed";
    throw new JevError(`${hint} (HTTP ${status}): ${errorDetail(body)}`, status, isRetryableStatus(status));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new JevError("Response was not valid JSON.", status, false);
  }
  const response = parsed as SystemOneResponse;
  if (!response || typeof response.answers !== "object" || response.answers === null) {
    throw new JevError("Response is missing `answers`.", status, false);
  }
  for (const id of questionIds ?? []) {
    if (!isAnswer(response.answers[id])) {
      throw new JevError(`Response is missing an answer for question "${id}".`, status, false);
    }
  }
  return response;
}

function isAnswer(value: unknown): value is Answer {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  switch (a.type) {
    case "noul":
      return typeof a.noul === "number";
    case "choice":
      return typeof a.choice === "string" && typeof a.confidence === "number";
    case "score":
      return typeof a.score === "number" && typeof a.confidence === "number";
    default:
      return false;
  }
}

function errorDetail(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "(empty body)";
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const detail = json.detail ?? json.error ?? json.message;
    if (detail !== undefined) return typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    // not JSON; fall through
  }
  return trimmed.length > 300 ? trimmed.slice(0, 300) + "…" : trimmed;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8000 };

/**
 * Delay before retry number `attempt` (1-based). Honors a `retry-after` header
 * (seconds) when present, otherwise exponential backoff with jitter.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter?: string | null,
  policy: RetryPolicy = DEFAULT_RETRY,
  random: () => number = Math.random,
): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, policy.maxDelayMs);
  const exp = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exp * (0.5 + random() / 2), policy.maxDelayMs);
}
