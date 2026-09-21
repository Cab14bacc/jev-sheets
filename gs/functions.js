// Top-level declarations Google Sheets can see. Custom functions and menu
// handlers must be plain global functions; the logic lives in the bundled
// `JevSheets` global (jev.js, built from src/).

/**
 * Asks Jev a yes/no question about text.
 *
 * @param {string|Array<Array<string>>} text A cell, a column (one answer per cell), or several columns (one answer per row, judged on all its cells).
 * @param {string} question A yes/no question, e.g. "Is this a complaint?"
 * @param {number} [threshold] Probability of "yes" needed to return TRUE (default 0.5).
 * @return TRUE or FALSE for each text.
 * @customfunction
 */
function JEV_IF(text, question, threshold) {
  return JevSheets.JEV_IF(text, question, threshold);
}

/**
 * Probability (0–1) that the answer to a yes/no question about text is "yes".
 *
 * @param {string|Array<Array<string>>} text A cell, a column (one answer per cell), or several columns (one answer per row, judged on all its cells).
 * @param {string} question A yes/no question, e.g. "Is this a complaint?"
 * @return A number from 0 (no) to 1 (yes) for each text.
 * @customfunction
 */
function JEV_PROB(text, question) {
  return JevSheets.JEV_PROB(text, question);
}

/**
 * Picks the option that best fits the text.
 *
 * @param {string|Array<Array<string>>} text A cell, a column (one answer per cell), or several columns (one answer per row, judged on all its cells).
 * @param {string|Array<Array<string>>} options Options as "a, b, c" or a range of cells.
 * @param {string} [question] What to decide, e.g. "Which team should handle this?"
 * @param {number} [min_confidence] Return UNSURE when confidence is below this (0–1).
 * @return The chosen option (or UNSURE) for each text.
 * @customfunction
 */
function JEV_CHOICE(text, options, question, min_confidence) {
  return JevSheets.JEV_CHOICE(text, options, question, min_confidence);
}

/**
 * Rates text on a scale of levels you define, from 1 (first level) upward.
 *
 * @param {string|Array<Array<string>>} text A cell, a column (one answer per cell), or several columns (one answer per row, judged on all its cells).
 * @param {string} question What to rate, e.g. "How frustrated is the customer?"
 * @param {string|Array<Array<string>>} levels 2–10 levels, lowest first: "calm, annoyed, furious" or a range.
 * @param {number} [min_confidence] Return UNSURE when confidence is below this (0–1).
 * @return A number between 1 and the number of levels (or UNSURE) for each text.
 * @customfunction
 */
function JEV_SCORE(text, question, levels, min_confidence) {
  return JevSheets.JEV_SCORE(text, question, levels, min_confidence);
}

// ---------------------------------------------------------------- triggers & menu

function onOpen(e) {
  JevSheets.onOpen(e);
}

function onInstall(e) {
  JevSheets.onInstall(e);
}

function jevShowSidebar() {
  JevSheets.showSidebar();
}

function jevInsertExamples() {
  JevSheets.insertExamples();
}

function jevHelp() {
  JevSheets.help();
}

// ---------------------------------------------------------------- sidebar RPCs (google.script.run)

function jevSidebarStatus() {
  return JevSheets.sidebarStatus();
}

function jevSidebarSaveKey(key, where) {
  return JevSheets.sidebarSaveKey(key, where);
}

function jevSidebarRemoveKey(where) {
  return JevSheets.sidebarRemoveKey(where);
}

function jevSidebarTest() {
  return JevSheets.sidebarTest();
}
