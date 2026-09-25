# Jev for Google Sheets

Classify, tag and score text in Google Sheets by asking plain-language questions in a formula. Answers come from [TypeSafe](https://typesafe.ai)'s Jev model in about a tenth of a second per row, as a real value your sheet can use: TRUE/FALSE, one of your categories, or a number. Every answer carries a confidence, so uncertain rows can say `UNSURE` instead of guessing.

## Formulas

| Formula | Asks | Returns |
|---|---|---|
| `JEV_IF(text, question, [threshold])` | a yes/no question | TRUE or FALSE. TRUE when the probability of "yes" is at least `threshold` (default 0.5). |
| `JEV_PROB(text, question)` | a yes/no question | The probability of "yes", from 0 to 1. |
| `JEV_CHOICE(text, options, [question], [min_confidence])` | which option fits | One of your options (2–255), or `UNSURE` when confidence is below `min_confidence`. |
| `JEV_SCORE(text, question, levels, [min_confidence])` | where the text falls on your scale | A number from 1 (first level) to N (last level), with 2–10 levels. It can land between levels (e.g. 2.4), or return `UNSURE` below `min_confidence`. |

`options` and `levels` can be a comma-separated string (`"billing, technical, sales"`) or a range of cells (`D1:D5`). List `levels` from lowest to highest.

```text
=JEV_IF(A2, "Is this a complaint?")
=JEV_PROB(A2, "Is this a complaint?")
=JEV_CHOICE(A2, "billing, technical, sales")
=JEV_CHOICE(A2, D1:D5, "Which team should handle this?", 0.6)
=JEV_SCORE(A2, "How urgent is this?", "not urgent, low, medium, high, critical")
```

- **Whole columns:** `=JEV_IF(A2:A500, "…")` fills one answer per cell. Requests run in parallel batches, with automatic retry when rate-limited.
- **Several columns:** `=JEV_IF(A2:C500, "…")` judges each **row** as one item, reading all its cells together (e.g. product name + description + price).
- **Caching:** identical questions on identical text are cached for 6 hours, so recalculation doesn't re-bill.
- **Errors** appear in the cell as `#JEV …`. A bad or missing key makes the whole formula error out.
- **Limits:** 1,000 cells per formula (Sheets gives custom functions 30 seconds).
- **Cost:** TypeSafe charges per input token ($0.042 per million at launch). A short cell is a fraction of a thousandth of a cent.

You need your own TypeSafe API key from [console.typesafe.ai](https://console.typesafe.ai/keys).


https://github.com/user-attachments/assets/1fd55d96-4155-4ebc-8410-5dcd8ec0a531


## Install

There are three ways to install, depending on who you are:

| You are… | Use | Needs Node.js? |
|---|---|---|
| Anyone | **A. Google Workspace Marketplace** (coming soon) | No |
| Anyone who wants it now | **B. Download a release and paste it in** | No |
| A developer changing the code | **C. Build from source** | Yes |

### A. Google Workspace Marketplace

*Listing pending review.* Once it's live: **Extensions → Add-ons → Get add-ons**, search "Jev for Sheets", click Install. Then follow [First run](#first-run).

### B. Download a release (no Node.js needed)

1. From the [latest release](https://github.com/Cab14bacc/jev-sheets/releases/latest), download `jev.js`, `functions.js`, `Sidebar.html` and `appsscript.json`.
2. Open a Google Sheet → **Extensions → Apps Script**, then do [Paste the files in](#paste-the-files-in) below.

### C. Build from source

Always start with:

```sh
npm install      # installs the build tools, including clasp
npm run build    # writes dist/: jev.js, functions.js, Sidebar.html, appsscript.json
```

Then upload `dist/` to Apps Script in **one** of two ways:

- **By hand:** open a Google Sheet → **Extensions → Apps Script**, then do [Paste the files in](#paste-the-files-in) below.
- **With clasp**, which uploads for you and is quicker if you'll push repeatedly:
  1. One time: enable the Apps Script API at <https://script.google.com/home/usersettings>, then run `npx clasp login`.
  2. Copy `.clasp.json.example` to `.clasp.json` and paste in your script ID (Apps Script → ⚙️ **Project Settings** → *Script ID*).
  3. Run `npm run push`. This rebuilds and uploads `dist/`. Run it again after every change.

### Paste the files in

In the Apps Script editor:

1. Click the project name at the top ("Untitled project") and rename it **Jev for Sheets**. This becomes the menu name under Extensions.
2. ⚙️ **Project Settings** → tick **Show "appsscript.json" manifest file in editor**. Back in the editor, replace everything in the editor's `appsscript.json` with the contents of the downloaded `appsscript.json`.
3. Rename `Code.gs` to `functions.gs` and replace its contents with `functions.js`.
4. **+ → Script**, name it `jev`, and paste in `jev.js`.
5. **+ → HTML**, name it `Sidebar` (exactly), and paste in `Sidebar.html`.
6. Save (Ctrl+S).

### First run

1. Reload the spreadsheet. A **Jev for Sheets** menu appears under **Extensions** (for a manual install, it's named after your Apps Script project).
2. Open **Settings & API key**. The first time, Google asks for permission. For a copy you pasted in yourself it warns "Google hasn't verified this app": choose **Advanced → Go to … (unsafe) → Allow**. It's your own script.
3. Paste your TypeSafe API key and click **Save key**. It tests the connection automatically.
4. Optional: **Insert example sheet** adds a tab with every formula already working.

### Where your key is stored

- **"Just for me"** is stored in your Apps Script *user* properties, which other people can't see.
- **"Everyone using Jev in this spreadsheet"** is stored in *document* properties. Other people's formulas in that spreadsheet then use (and bill) your key. With a pasted-in copy, anyone who can edit the sheet can also open the script and read it. Use it only in sheets you trust.

The sidebar never shows the full key, only its last 4 characters.

Cell text is sent only to `api.typesafe.ai` (see TypeSafe's [privacy policy](https://typesafe.ai/legal/privacy-policy)). This project runs no server and collects nothing.

## Development

```sh
npm test          # unit tests (no network)
npm run typecheck
npm run build     # → dist/
TYPESAFE_API_KEY=... npm run try   # live call against the real API
```

- `src/examples.ts`: contents of the "Jev examples" tab.
- `gs/Sidebar.html`: the settings sidebar (it talks to the `jevSidebar*` functions via `google.script.run`).
- `docs/`: the GitHub Pages site (homepage, privacy policy, terms), which the Marketplace listing needs. `npm run assets` renders the listing icons, the 220×140 banner and the site icon from the artwork in `assets/logo-source.png` and `assets/banner-source.png`.
- `src/functions.ts`: the formula logic. Apps Script services are injected through `SheetsEnv`, so it all runs in Node.
- `src/index.ts`: the Apps Script glue (UrlFetchApp, CacheService, properties, menu). It is bundled into the global `JevSheets`.
- `gs/functions.js`: the top-level functions Sheets discovers, with the `@customfunction` docs shown in autocomplete.
- `src/core/`: a small client for TypeSafe's System One API (types, question builders, response parsing, retry and confidence helpers). It has no dependencies.

## License

MIT
