// Bundled by esbuild into the global `JevSheets`; gs/functions.js exposes it to Sheets.
import { DEFAULT_MODEL, buildHttpRequest, noul, parseHttpResponse, type HttpRequest } from "./core";
import { EXAMPLES_SHEET_NAME, examplesSheet } from "./examples";
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

// ------------------------------------------------------------ add-on menu

export const HOMEPAGE_URL = "https://cab14bacc.github.io/jev-sheets/";

/**
 * Runs on open in every mode. In AuthMode.NONE (add-on installed but not yet
 * used in this file) only building the menu is allowed, which is all this does.
 */
export function onOpen() {
  SpreadsheetApp.getUi()
    .createAddonMenu()
    .addItem("Settings & API key", "jevShowSidebar")
    .addItem("Insert example sheet", "jevInsertExamples")
    .addSeparator()
    .addItem("Help", "jevHelp")
    .addToUi();
}

export function onInstall() {
  onOpen();
}

export function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("Sidebar").setTitle("Jev");
  SpreadsheetApp.getUi().showSidebar(html);
}

// ------------------------------------------------------------ sidebar RPCs
// Called from Sidebar.html via google.script.run. The key itself never goes
// back to the browser; status only reports its last 4 characters.

export interface KeyStatus {
  user: string | null;
  document: string | null;
  active: "user" | "document" | null;
  model: string;
}

type Where = "user" | "document";

function store(where: Where): GoogleAppsScript.Properties.Properties {
  return where === "user" ? PropertiesService.getUserProperties() : PropertiesService.getDocumentProperties();
}

const mask = (key: string | null) => (key ? `••••${key.slice(-4)}` : null);

export function sidebarStatus(): KeyStatus {
  const user = PropertiesService.getUserProperties().getProperty(KEY_PROP);
  const document = PropertiesService.getDocumentProperties().getProperty(KEY_PROP);
  return {
    user: mask(user),
    document: mask(document),
    active: user ? "user" : document ? "document" : null,
    model: env.getModel(),
  };
}

export function sidebarSaveKey(key: string, where: Where): KeyStatus {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) throw new Error("Paste a key first.");
  if (/\s/.test(trimmed) || trimmed.length > 500) throw new Error("That doesn't look like an API key.");
  store(where).setProperty(KEY_PROP, trimmed);
  return sidebarStatus();
}

export function sidebarRemoveKey(where: Where): KeyStatus {
  store(where).deleteProperty(KEY_PROP);
  return sidebarStatus();
}

export function sidebarTest(): { ok: boolean; message: string } {
  try {
    const req = buildHttpRequest(env.getApiKey() ?? "", {
      state: "Help! My payouts have been failing for 3 days.",
      model: env.getModel(),
      questions: { is_urgent: noul("Does this convey urgency?") },
    });
    const started = Date.now();
    const [res] = env.fetchAll([req]);
    const parsed = parseHttpResponse(res.status, res.body, ["is_urgent"]);
    const a = parsed.answers.is_urgent;
    const p = a.type === "noul" ? a.noul.toFixed(2) : "?";
    return { ok: true, message: `Connected to ${parsed.model} in ${Date.now() - started} ms (test answer ${p}, expected near 1).` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ------------------------------------------------------------ examples & help

export function insertExamples() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(EXAMPLES_SHEET_NAME);
  if (sheet) {
    ss.setActiveSheet(sheet);
    ss.toast("The example sheet already exists.", "Jev");
    return;
  }
  const { values, formulas, notes } = examplesSheet();
  sheet = ss.insertSheet(EXAMPLES_SHEET_NAME);
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.getRange(1, 1, 1, notes[0].length).setNotes(notes);
  for (const { cell, formula } of formulas) sheet.getRange(cell).setFormula(formula);
  sheet.getRange(1, 1, 1, values[0].length).setFontWeight("bold").setBackground("#f1f3f4");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 420);
  sheet.setColumnWidth(2, 160);
  sheet.autoResizeColumns(3, values[0].length - 2);
  ss.setActiveSheet(sheet);
  if (!env.getApiKey()) {
    ss.toast("Add your API key in Extensions → Jev → Settings to fill in the results.", "Jev", 8);
    showSidebar();
  }
}

export function help() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "Jev functions",
    [
      '=JEV_IF(A2, "Is this a complaint?")  → TRUE/FALSE',
      '=JEV_PROB(A2, "Is this a complaint?")  → 0–1',
      '=JEV_CHOICE(A2, "billing, technical, sales")  → one option',
      '=JEV_CHOICE(A2, D1:D5, "Which team?", 0.6)  → option, or UNSURE below 0.6 confidence',
      '=JEV_SCORE(A2, "How angry?", "calm, annoyed, furious")  → 1–3',
      "",
      "Pass a whole column (A2:A500) to fill results down.",
      "Pass several columns (A2:C500) to judge each row on all its cells together.",
      "Answers are cached for 6 hours, so recalculation doesn't re-bill.",
      "",
      `More: ${HOMEPAGE_URL}`,
    ].join("\n"),
    ui.ButtonSet.OK,
  );
}
