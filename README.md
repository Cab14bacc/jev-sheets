# Jev for Google Sheets

Ask typed questions about your spreadsheet cells with [TypeSafe](https://typesafe.ai)'s Jev model. Jev answers in about 100 ms per row and returns a confidence with every answer, so you can have the sheet say `UNSURE` when Jev isn't sure.

| Formula | Returns |
|---|---|
| `=JEV_IF(A2, "Is this a complaint?")` | TRUE / FALSE (optional 3rd arg: threshold, default 0.5) |
| `=JEV_PROB(A2, "Is this a complaint?")` | probability of "yes", 0–1 |
| `=JEV_CHOICE(A2, "billing, technical, sales")` | one option (options can also be a range) |
| `=JEV_CHOICE(A2, D1:D5, "Which team?", 0.6)` | option, or `UNSURE` when confidence < 0.6 |
| `=JEV_SCORE(A2, "How angry?", "calm, annoyed, furious")` | 1–3 (can land between levels) |

- **Whole columns:** `=JEV_IF(A2:A500, "…")` fills one answer per cell. Requests run in parallel batches, with automatic retry when rate-limited.
- **Several columns:** `=JEV_IF(A2:C500, "…")` judges each **row** as one item, reading all its cells together (e.g. product name + description + price).
- **Caching:** identical questions on identical text are cached for 6 hours, so recalculation doesn't re-bill.
- **Errors** appear in the cell as `#JEV …`. A bad or missing key makes the whole formula error out.
- **Limits:** 1,000 cells per formula (Sheets gives custom functions 30 seconds).
- **Cost:** TypeSafe charges per input token ($0.042 per million at launch). A short cell is a fraction of a thousandth of a cent.

You need your own TypeSafe API key from [console.typesafe.ai](https://console.typesafe.ai/keys).

## Install into a sheet

### Quick: copy and paste

1. `npm install && npm run build`
2. In a Google Sheet, open **Extensions → Apps Script**.
3. Under ⚙️ **Project Settings**, tick **Show "appsscript.json" manifest file in editor**. Replace that file's contents with `dist/appsscript.json`.
4. Rename `Code.gs` to `functions.gs` and paste in `dist/functions.js`. Add a script named `jev` and paste in `dist/jev.js`. Save.
5. Reload the sheet → **Jev → Set API key (just for me)** → **Jev → Test connection**. The first time, Google warns the script is unverified: choose **Advanced → Go to … → Allow**.

### With clasp

1. Enable the Apps Script API at <https://script.google.com/home/usersettings> (one time).
2. Run:
   ```sh
   npx @google/clasp login
   cp .clasp.json.example .clasp.json   # paste your script ID from Project Settings
   npm run push
   ```

### Where your key is stored

- **"Just for me"** is stored in your Apps Script *user* properties, which other people can't see.
- **"For this spreadsheet"** is stored in *document* properties. Anyone who can edit the sheet can open its script and read the key. Use it only in sheets you don't share.

Cell text is sent only to `api.typesafe.ai` (see TypeSafe's [privacy policy](https://typesafe.ai/legal/privacy-policy)). This project runs no server and collects nothing.

## Development

```sh
npm test          # unit tests (no network)
npm run typecheck
npm run build     # → dist/
TYPESAFE_API_KEY=... npm run try   # live call against the real API
```

- `src/functions.ts`: the formula logic. Apps Script services are injected through `SheetsEnv`, so it all runs in Node.
- `src/index.ts`: the Apps Script glue (UrlFetchApp, CacheService, properties, menu). It is bundled into the global `JevSheets`.
- `gs/functions.js`: the top-level functions Sheets discovers, with the `@customfunction` docs shown in autocomplete.
- `src/core/`: a small client for TypeSafe's System One API (types, question builders, response parsing, retry and confidence helpers). It has no dependencies.

## License

MIT
