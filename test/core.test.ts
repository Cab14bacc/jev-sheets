import { describe, expect, it } from "vitest";
import {
  band,
  buildHttpRequest,
  choice,
  JevError,
  noul,
  parseHttpResponse,
  retryDelayMs,
  score,
  validateThresholds,
} from "../src/core";

// Response copied from the quickstart in https://docs.typesafe.ai/introduction/quickstart.md
const QUICKSTART_RESPONSE = JSON.stringify({
  model: "jev-1.13.0",
  answers: {
    department: {
      type: "choice",
      choice: "technical",
      confidence: 0.78,
      probabilities: { technical: 0.85, sales: 0.0, billing: 0.15 },
    },
    frustration: {
      type: "score",
      score: 1.0,
      confidence: 1.0,
      legend: { "0": "Calm", "1": "Frustrated but civil", "2": "Very angry" },
      probabilities: { "0": 0.0, "1": 1.0, "2": 0.0 },
    },
    is_urgent: { type: "noul", noul: 1.0 },
  },
  usage: { input_tokens: 392, output_tokens: 65 },
});

describe("question builders", () => {
  it("builds a choice from a list with null descriptions", () => {
    expect(choice("Which team?", ["billing", "technical"])).toEqual({
      type: "choice",
      instructions: "Which team?",
      criteria: { billing: null, technical: null },
    });
  });

  it("rejects choices outside 2–255 options", () => {
    expect(() => choice("q", ["only"])).toThrow(RangeError);
    const many = Array.from({ length: 256 }, (_, i) => `o${i}`);
    expect(() => choice("q", many)).toThrow(/at most 255/);
  });

  it("rejects scores outside 2–10 levels", () => {
    expect(() => score("q", ["one"])).toThrow(RangeError);
    expect(() => score("q", Array.from({ length: 11 }, String))).toThrow(RangeError);
    expect(score("q", ["low", "high"]).criteria).toEqual(["low", "high"]);
  });

  it("omits noul criteria when not given", () => {
    expect(noul("Urgent?")).toEqual({ type: "noul", instructions: "Urgent?" });
  });
});

describe("protocol", () => {
  it("builds the documented HTTP request", () => {
    const req = buildHttpRequest("sk-test", {
      state: "hi",
      model: "jev-latest",
      questions: { u: noul("Urgent?") },
    });
    expect(req.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(req.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(req.body)).toEqual({
      state: "hi",
      model: "jev-latest",
      questions: { u: { type: "noul", instructions: "Urgent?" } },
    });
  });

  it("refuses to build a request without a key", () => {
    expect(() => buildHttpRequest("", { state: "", model: "m", questions: {} })).toThrow(JevError);
  });

  it("parses the documented quickstart response", () => {
    const res = parseHttpResponse(200, QUICKSTART_RESPONSE, ["department", "frustration", "is_urgent"]);
    expect(res.model).toBe("jev-1.13.0");
    expect(res.answers.department).toMatchObject({ type: "choice", choice: "technical" });
  });

  it("throws when an expected answer is missing", () => {
    expect(() => parseHttpResponse(200, QUICKSTART_RESPONSE, ["nope"])).toThrow(/nope/);
  });

  it.each([
    [401, false],
    [422, false],
    [429, true],
    [529, true],
    [503, true],
  ])("maps HTTP %i to retryable=%s", (status, retryable) => {
    try {
      parseHttpResponse(status, JSON.stringify({ detail: "boom" }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(JevError);
      expect((e as JevError).retryable).toBe(retryable);
      expect((e as JevError).message).toContain("boom");
    }
  });

  it("honors retry-after, else backs off exponentially within the cap", () => {
    expect(retryDelayMs(1, "2")).toBe(2000);
    expect(retryDelayMs(1, null, undefined, () => 1)).toBe(500);
    expect(retryDelayMs(3, null, undefined, () => 1)).toBe(2000);
    expect(retryDelayMs(10, null, undefined, () => 1)).toBe(8000);
  });
});

describe("confidence bands", () => {
  const t = validateThresholds({ act: 0.85, suggest: 0.5 });
  it("bands values", () => {
    expect(band(0.9, t)).toBe("act");
    expect(band(0.85, t)).toBe("act");
    expect(band(0.6, t)).toBe("suggest");
    expect(band(0.1, t)).toBe("skip");
  });
  it("rejects inverted thresholds", () => {
    expect(() => validateThresholds({ act: 0.4, suggest: 0.6 })).toThrow(RangeError);
  });
});
