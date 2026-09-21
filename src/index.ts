// Bundled by esbuild into the global `JevSheets`; gs/functions.js exposes it to Sheets.
import { DEFAULT_MODEL, buildHttpRequest, noul, parseHttpResponse, type HttpRequest } from "./core";
import { jevChoice, jevIf, jevProb, jevScore, type CellInput, type SheetsEnv } from "./functions";

const KEY_PROP = "TYPESAFE_API_KEY";
const MODEL_PROP = "JEV_MODEL";
const CACHE_TTL_SECONDS = 21600; // Apps Script maximum (6 h)

function getProperty(name: string): string | null {
  // Per-user first; the per-document key is a fallback for shared sheets.
  // Custom functions may only read properties, which is all this does.
  return (
    PropertiesService.getUserProperties().getProperty(name) ??
    PropertiesService.getDocumentProperties()?.getProperty(name) ??
    null
  );
}

function cache(): GoogleAppsScript.Cache.Cache {
  return CacheService.getDocumentCache() ?? CacheService.getScriptCache();
}

const env: SheetsEnv = {
  getApiKey: () => getProperty(KEY_PROP),
  getModel: () => getProperty(MODEL_PROP) ?? DEFAULT_MODEL,
  fetchAll(requests: HttpRequest[]) {
    const responses = UrlFetchApp.fetchAll(
      requests.map((r) => ({
        url: r.url,
        method: "post" as const,
        headers: { Authorization: r.headers.Authorization },
        contentType: r.headers["Content-Type"],
        payload: r.body,
        muteHttpExceptions: true,
      })),
    );
    return responses.map((res) => {
      const headers = res.getHeaders() as Record<string, string>;
      return {
        status: res.getResponseCode(),
        body: res.getContentText(),
        retryAfter: headers["Retry-After"] ?? headers["retry-after"] ?? null,
      };
    });
  },
  cacheGetAll: (keys) => (keys.length ? cache().getAll(keys) : {}),
  cachePutAll: (values) => cache().putAll(values, CACHE_TTL_SECONDS),
  sleep: (ms) => Utilities.sleep(ms),
  hash(text) {
    const bytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8,
    );
    return Utilities.base64Encode(bytes);
  },
};

// ------------------------------------------------------------ custom functions

export const JEV_IF = (text: CellInput, question: CellInput, threshold?: CellInput) =>
  jevIf(env, text, question as string, threshold as number);
export const JEV_PROB = (text: CellInput, question: CellInput) => jevProb(env, text, question as string);
export const JEV_CHOICE = (text: CellInput, options: CellInput, question?: CellInput, minConfidence?: CellInput) =>
  jevChoice(env, text, options, question as string, minConfidence as number);
export const JEV_SCORE = (text: CellInput, question: CellInput, levels: CellInput, minConfidence?: CellInput) =>
  jevScore(env, text, question as string, levels, minConfidence as number);

// ------------------------------------------------------------ menu

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Jev")
    .addItem("Set API key (just for me)", "jevSetUserKey")
    .addItem("Set API key for this spreadsheet (visible to editors)", "jevSetDocumentKey")
    .addItem("Test connection", "jevTestConnection")
    .addSeparator()
    .addItem("Help", "jevHelp")
    .addToUi();
}

function promptForKey(): string | null {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "TypeSafe API key",
    "Paste your key from console.typesafe.ai/keys. Leave empty to remove it.",
    ui.ButtonSet.OK_CANCEL,
  );
  return res.getSelectedButton() === ui.Button.OK ? res.getResponseText().trim() : null;
}

function saveKey(props: GoogleAppsScript.Properties.Properties, where: string) {
  const key = promptForKey();
  if (key === null) return;
  if (key) props.setProperty(KEY_PROP, key);
  else props.deleteProperty(KEY_PROP);
  SpreadsheetApp.getActive().toast(key ? `API key saved ${where}.` : `API key removed ${where}.`, "Jev");
}

export function jevSetUserKey() {
  saveKey(PropertiesService.getUserProperties(), "for you");
}

export function jevSetDocumentKey() {
  saveKey(PropertiesService.getDocumentProperties(), "for this spreadsheet");
}

export function jevTestConnection() {
  const ui = SpreadsheetApp.getUi();
  try {
    const req = buildHttpRequest(env.getApiKey() ?? "", {
      state: "Help! My payouts have been failing for 3 days.",
      model: env.getModel(),
      questions: { is_urgent: noul("Does this convey urgency?") },
    });
    const [res] = env.fetchAll([req]);
    const parsed = parseHttpResponse(res.status, res.body, ["is_urgent"]);
    const a = parsed.answers.is_urgent;
    ui.alert(
      "Jev is working",
      `Model: ${parsed.model}\nSample answer (should be near 1): ${a.type === "noul" ? a.noul : "?"}`,
      ui.ButtonSet.OK,
    );
  } catch (e) {
    ui.alert("Jev connection failed", (e as Error).message, ui.ButtonSet.OK);
  }
}

export function jevHelp() {
  SpreadsheetApp.getUi().alert(
    "Jev functions",
    [
      '=JEV_IF(A2, "Is this a complaint?")  → TRUE/FALSE',
      '=JEV_PROB(A2, "Is this a complaint?")  → 0–1',
      '=JEV_CHOICE(A2, "billing, technical, sales")  → one option',
      '=JEV_CHOICE(A2, D1:D5, "Which team?", 0.6)  → option, or UNSURE below 0.6 confidence',
      '=JEV_SCORE(A2, "How angry?", "calm, annoyed, furious")  → 1–3',
      "",
      "Pass a whole column (A2:A500) instead of one cell to fill results down.",
      "Pass several columns (A2:C500) to judge each row on all its cells together.",
      "Answers are cached for 6 hours, so recalculation doesn't re-bill.",
    ].join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}
