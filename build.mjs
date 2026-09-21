// Bundles src/ into dist/jev.js (global `JevSheets`) and copies the Apps Script
// wrapper + manifest next to it. dist/ is what `clasp push` uploads, or what you
// paste into the Apps Script editor by hand.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  globalName: "JevSheets",
  target: "es2019",
  outfile: "dist/jev.js",
  legalComments: "none",
});

copyFileSync("gs/functions.js", "dist/functions.js");
copyFileSync("gs/appsscript.json", "dist/appsscript.json");
console.log("Built dist/: jev.js, functions.js, appsscript.json");
