import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../src/core";
import { jevChoice, jevIf, jevProb, jevScore, MAX_CELLS, parseList, UNSURE, type SheetsEnv } from "../src/functions";

type Reply = { status: number; body: unknown; retryAfter?: string };

/** Fake Apps Script: `respond` decides each reply from the request's state text. */
function fakeEnv(respond: (state: string, call: number) => Reply, apiKey: string | null = "sk-test") {
  const store: Record<string, string> = {};
  const calls: HttpRequest[][] = [];
  const sleeps: number[] = [];
  let n = 0;
  const env: SheetsEnv = {
    getApiKey: () => apiKey,
    getModel: () => "jev-latest",
    fetchAll(requests) {
      calls.push(requests);
      return requests.map((r) => {
        const { state } = JSON.parse(r.body);
        const reply = respond(typeof state === "string" ? state : JSON.stringify(state), n++);
        return {
          status: reply.status,
          body: typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body),
          retryAfter: reply.retryAfter ?? null,
        };
      });
    },
    cacheGetAll: (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
    cachePutAll: (values) => Object.assign(store, values),
    sleep: (ms) => void sleeps.push(ms),
    hash: (text) => text, // identity is fine for tests
  };
  return { env, calls, sleeps, store };
}

const noulReply = (p: number): Reply => ({
  status: 200,
  body: { model: "jev-1.13.0", answers: { q: { type: "noul", noul: p } }, usage: { input_tokens: 1, output_tokens: 1 } },
});

const choiceReply = (pick: string, confidence: number): Reply => ({
  status: 200,
  body: {
    model: "jev-1.13.0",
    answers: { q: { type: "choice", choice: pick, probabilities: { [pick]: 1 }, confidence } },
    usage: { input_tokens: 1, output_tokens: 1 },
  },
});

describe("JEV_IF / JEV_PROB", () => {
  it("answers a single cell", () => {
    const { env } = fakeEnv(() => noulReply(0.8));
    expect(jevIf(env, "I want a refund", "Is this a complaint?")).toBe(true);
    expect(jevIf(env, "I want a refund", "Is this a complaint?", 0.9)).toBe(false);
    expect(jevProb(env, "I want a refund", "Is this a complaint?")).toBe(0.8);
  });

  it("maps a range back onto its shape, skipping blanks and deduplicating texts", () => {
    const { env, calls } = fakeEnv((state) => noulReply(state.includes("refund") ? 0.9 : 0.1));
    const out = jevIf(env, [["refund please"], [""], ["great product"], ["refund please"]], "Complaint?");
    expect(out).toEqual([[true], [""], [false], [true]]);
    expect(calls.flat()).toHaveLength(2); // duplicate text sent once
  });

  it("treats each row of a multi-column range as one item", () => {
    const { env, calls } = fakeEnv((state) => noulReply(state.includes("steel toe") ? 0.95 : 0.05));
    const out = jevIf(
      env,
      [
        ["Work boot", "steel toe, EN ISO 20345"],
        ["Sneaker", "canvas upper"],
        ["", ""],
        ["Only a name", ""],
      ],
      "Is this a safety shoe?",
    );
    expect(out).toEqual([[true], [false], [""], [false]]);
    const states = calls.flat().map((r) => JSON.parse(r.body).state);
    expect(states).toEqual([["Work boot", "steel toe, EN ISO 20345"], ["Sneaker", "canvas upper"], "Only a name"]);
  });

  it("serves repeats from cache so recalculation doesn't re-bill", () => {
    const { env, calls } = fakeEnv(() => noulReply(0.7));
    jevProb(env, [["a"], ["b"]], "q?");
    jevProb(env, [["a"], ["b"]], "q?");
    expect(calls).toHaveLength(1);
  });

  it("does not share cache entries across different questions", () => {
    const { env, calls } = fakeEnv(() => noulReply(0.7));
    jevProb(env, "a", "question one?");
    jevProb(env, "a", "question two?");
    expect(calls).toHaveLength(2);
  });

  it("retries 429s with backoff and then succeeds", () => {
    const { env, sleeps } = fakeEnv((_, call) =>
      call === 0 ? { status: 429, body: { detail: "slow down" }, retryAfter: "1" } : noulReply(0.6),
    );
    expect(jevProb(env, "x", "q?")).toBe(0.6);
    expect(sleeps).toEqual([1000]);
  });

  it("reports per-cell errors without failing the whole range, and doesn't cache them", () => {
    const { env, store } = fakeEnv((state) =>
      state === "bad" ? { status: 422, body: { detail: "malformed" } } : noulReply(0.9),
    );
    const out = jevIf(env, [["good"], ["bad"]], "q?") as unknown[][];
    expect(out[0][0]).toBe(true);
    expect(String(out[1][0])).toMatch(/^#JEV .*malformed/);
    expect(Object.keys(store)).toHaveLength(1);
  });

  it("surfaces an invalid key as one formula error", () => {
    const { env } = fakeEnv(() => ({ status: 401, body: { detail: "bad key" } }));
    expect(() => jevIf(env, [["a"], ["b"]], "q?")).toThrow(/invalid API key/);
  });

  it("explains how to set a missing key", () => {
    const { env } = fakeEnv(() => noulReply(1), null);
    expect(() => jevIf(env, "a", "q?")).toThrow(/Set API key/);
  });

  it("rejects oversized ranges before calling the API", () => {
    const { env, calls } = fakeEnv(() => noulReply(1));
    const big = Array.from({ length: MAX_CELLS + 1 }, (_, i) => [`t${i}`]);
    expect(() => jevIf(env, big, "q?")).toThrow(/limit/);
    expect(calls).toHaveLength(0);
  });

  it("requires a question", () => {
    const { env } = fakeEnv(() => noulReply(1));
    expect(() => jevIf(env, "a", "")).toThrow(/question is required/);
  });
});

describe("JEV_CHOICE", () => {
  it("returns the choice, or UNSURE below min_confidence", () => {
    const { env } = fakeEnv((state) => choiceReply("billing", state === "sure" ? 0.9 : 0.3));
    expect(jevChoice(env, [["sure"], ["meh"]], "billing, technical", undefined, 0.6)).toEqual([
      ["billing"],
      [UNSURE],
    ]);
  });

  it("accepts options as a range and sends them as choice criteria", () => {
    const { env, calls } = fakeEnv(() => choiceReply("sales", 1));
    jevChoice(env, "x", [["billing"], ["sales"]], "Which team?");
    const body = JSON.parse(calls[0][0].body);
    expect(body.questions.q).toEqual({
      type: "choice",
      instructions: "Which team?",
      criteria: { billing: null, sales: null },
    });
  });

  it("reserves the UNSURE label", () => {
    const { env } = fakeEnv(() => choiceReply("a", 1));
    expect(() => jevChoice(env, "x", "a, UNSURE")).toThrow(/reserved/);
  });
});

describe("JEV_SCORE", () => {
  it("returns a 1-based level", () => {
    const { env } = fakeEnv(() => ({
      status: 200,
      body: {
        model: "jev-1.13.0",
        answers: {
          q: {
            type: "score",
            score: 1.05,
            legend: { "0": "calm", "1": "annoyed", "2": "furious" },
            probabilities: { "0": 0, "1": 0.95, "2": 0.05 },
            confidence: 0.92,
          },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    }));
    expect(jevScore(env, "ugh", "How angry?", "calm, annoyed, furious")).toBe(2.05);
    expect(jevScore(env, "ugh", "How angry?", "calm, annoyed, furious", 0.95)).toBe(UNSURE);
  });
});

describe("parseList", () => {
  it("parses strings and ranges, rejecting duplicates", () => {
    expect(parseList("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(parseList([["a", ""], ["b", null]])).toEqual(["a", "b"]);
    expect(() => parseList("a, a")).toThrow(/Duplicate/);
  });
});
