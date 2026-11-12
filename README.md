# Collection Studio

A desktop art-production tool for collectible mobile-game card sets. Enter a set theme and art direction; produce 3–5 complete ten-card variants, inspect them against source art, keep the strongest versions, and export a delivery archive.

English and Russian interface with persistent **Dark / Light** palettes inspired by Photoshop. **Settings → Interface** offers device language (default), English or Russian. Unsupported device languages fall back to English. Built with Electron, React and strict TypeScript.

## Run

```sh
npm ci
npm run build
npm start
```

Node.js 22+ and macOS are required for the validated configuration. `npm run dev` enables development reloads. If package-manager policy disables dependency install scripts, run `node node_modules/electron/install.js` once.

The local macOS bundle is produced by `npm run package:mac` at `release/mac-arm64/Collection Studio.app`. It is an unsigned local build, not a notarized distribution. The bundle includes all 160 private source card references for local evaluation; do not publish that bundle or the supplied art without permission.

## Generation providers

### Codex CLI / ChatGPT — default

1. Install Codex CLI and sign in using `codex login` → **Sign in with ChatGPT**.
2. Open **Settings**, select **Codex CLI · ChatGPT subscription**, and click **Test connection**.
3. If auto-detection fails, set the absolute executable path under **Models and Codex executable**.

The main process launches `codex exec` without a shell, in an isolated per-request job directory. The CLI reuses its own login. API-key environment variables are removed; the application does not read, copy or exchange ChatGPT tokens. Images use native `image_gen`; planning and visual review use structured CLI responses. Each task uses `workspace-write` sandboxing. Unrelated app connectors and agent delegation are disabled.

This mode uses Codex subscription limits. Image generation consumes included usage more quickly than ordinary text turns. **Quality is a prompt preference in this mode**, not a guaranteed low/medium/high API parameter. Actual underlying image model and billing details remain controlled by Codex. Compatibility was verified with CLI `0.167.0-alpha.4.1`; other versions require a connection and image calibration check.

### OpenAI Images API — optional

Choose **OpenAI API · separate billing** and enter an API key in Settings. The key is encrypted using Electron safeStorage and stays in the main process. During development an ignored project `.env` can supply `OPENAI_API_KEY`; it takes precedence over a previously saved key and is imported into encrypted local storage. `.env` is never packaged.

The API adapter uses `images.edit`, explicit PNG MIME types, reference images, structured planning and visual reviews. SDK retries are disabled. Default models: `gpt-image-2` and `gpt-4.1-mini`. A successful connection check validates model access, not available credit. The supplied account returned `429 no credits remaining` during the live API image test; the Codex path was verified separately.

## Producer workflow

1. Open **New set** and enter the theme and free-form art direction.
2. Generate three ten-card variants. The main screen contains only theme and optional art direction. Settings control the reference budget, style threshold and bounded automatic repairs.
3. Start generation. The planner validates ten distinct subjects and all four composition categories in each variant before image generation begins.
4. Open a card to compare its selected image with a category reference, inspect review findings, compare versions, regenerate or lock the selection.
5. Use **Pause** to stop scheduling. Two already-running requests may finish. **Resume** retains finished images. After an interruption, unfinished requests are marked uncertain and never silently replayed.
6. Use **Select for delivery**, then **Export set**. Export requires all ten selected cards and the complete set to pass review. Model approval still requires a final human art judgment.

The **Production log & limits** panel can raise the image-request cap while a run is idle. The cap counts application image requests, including failed attempts; it is not a dollar limit or a precise measure of native Codex tool retries. Planning and review also consume provider usage.

## References and data

- `art/`: original employer-supplied artwork, excluded from Git.
- `references/`: board exports, download manifest, contact sheets and research evidence, excluded from Git.
- `resources/style-profile.json`: canonical rendering rules, four categories and eight curated anchor candidates; every reference pack retains at least four originals.
- `resources/library.json`: all available employer references, source hashes, set tags and exclusions.
- `src/shared/StyleContracts.ts`: validated production policy and structured agent evidence.
- `resources/references/`: prepared reference images, excluded from Git.
- Run data defaults to the application user-data directory. Set `COLLECTION_STUDIO_DATA` before launch to choose another directory. The development verification uses the project `runs/` directory.
- A run contains atomic `run.json`, a style-profile snapshot, original image masters, 430×480 previews and contact sheets. Codex job prompts, structured responses and transcripts live in `_codex-jobs/` beside runs.

The complete local toolbar export in `Art Sources/` contains **185 of 185 board PNG assets**: **160 individual cards** are imported into the style library; **25 collection sheets, screenshots and result-frame images** remain reference-only. All 185 export hashes were verified before import. The original 120 API-downloaded cards retain their recorded Miro IDs and curated filenames. The 40 newly available cards use stable SHA-derived IDs and frame/filename provenance; their individual Miro item IDs are not claimed. The older API download manifest remains unchanged and still records its original partial download history.

To recreate the private style library, obtain the supplied originals and run `REFERENCE_ART_DIR=/absolute/path/to/originals npm run prepare:references`. The script searches subfolders and verifies source hashes. Without that variable it uses the local Miro manifest. The eight required original filenames are `CardC6_card_21.png`, `24`, `14`, `53`, `13`, `48`, `91`, and `60` with the same prefix/extension. Copying the already prepared private reference folder is also supported. The distributable source contains no employer artwork.

## Export

Each ZIP contains:

- `cards/01.png` … `10.png` at 430×480;
- unchanged selected originals under `masters/`;
- previous card previews under `history/`;
- `contact-sheet.png`, `selection.json`, `run.json`, `style-profile.json`, and `report.md`.

Source reference artwork and credentials are not included. Run metadata includes prompts, attempts, model/backend identifiers, usage when supplied, request/thread IDs, review findings, manual selection and locks. Production export is blocked until every selected card and the complete set pass review. Unresolved work remains saved for inspection and correction.

## Architecture

```text
React renderer → typed preload bridge → validated Electron IPC
                                      ↓
                                  RunService
                          domain rules + narrow ports
                                      ↓
                 Codex / OpenAI adapters + filesystem storage
```

The renderer has no Node integration or credential access. The application layer depends on `GenerationPort`, `RunStore` and `ImageStore`. State transitions, budget reservation and persistence are deterministic; image generation and model judgments are probabilistic. No game SDK changes are involved.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Offline integration tests cover structural invariants, call caps, pause/resume, concurrent starts, interrupted requests, review failures and ten-card exports. Synthetic test rasters are disposable fixtures and are never presented as generated art.

`npm run calibrate:codex` performs one real reference-guided image generation and visual review using subscription usage. `npm run smoke:api` performs one real paid API image request. Neither runs during ordinary automated tests.

See [current implementation plan](docs/STYLE_PIPELINE_IMPLEMENTATION_PLAN.md), [art and research notes](docs/ART_AND_RESEARCH.md), and [validation record](docs/VALIDATION.md). Final cinema sets, a calibrated multi-model benchmark, Miro placement and a GitHub publication must be reported separately from application implementation.

## Official provider documentation

- [Codex image generation and subscription usage](https://learn.chatgpt.com/docs/image-generation)
- [Non-interactive Codex, structured output and saved authentication](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenAI image generation API](https://developers.openai.com/api/docs/guides/image-generation)

Direct Sign in with ChatGPT token-sharing API limitations do not establish the capabilities of native Codex CLI tools. The CLI adapter invokes the installed first-party application, not an undocumented token exchange or browser session.

## Localization

`src/shared/i18n/Localization.ts` owns locale resolution, typed catalog lookup and interpolation. Separate `en.json` / `ru.json` catalogs have matching keys and placeholders, checked by tests. `LocalizationContext` supplies the presentation service to React; Electron supplies the device language list and applies the same locale to native menus and export dialogs. Dates use the active locale. Language and theme preferences are stored locally and apply immediately. User-authored briefs, generated content, prompts and external provider diagnostics retain their original text. Add catalog entries for new interface strings; do not embed locale conditionals in components.

Palette reference: [Adobe Photoshop interface preferences](https://helpx.adobe.com/photoshop/web/get-set-up/preferences-and-settings/app-settings-and-preferences.html). The application uses an adapted two-theme palette, not an exact reproduction of Adobe chrome.

## Style-first production

Detailed implementation and acceptance plan: [STYLE_PIPELINE_IMPLEMENTATION_PLAN.md](docs/STYLE_PIPELINE_IMPLEMENTATION_PLAN.md). Inspected public source and architecture decisions: [STYLE_ARCHITECTURE_RESEARCH.md](docs/STYLE_ARCHITECTURE_RESEARCH.md).

The reference librarian analyzes source images in batches of eight (two concurrent batches), caches results by SHA/model/schema version, and excludes character/gold/UI sources. The producer analyst turns the brief into retrieval requirements. Weighted lexical retrieval over visual metadata (BM25-like IDF, material/subject/category features) produces candidates; a separate vision art director reranks the images and assigns each attachment an explicit role, take/ignore guidance and selection reason. This is retrieval-augmented context construction, not an embedding/vector database implementation.

Every reference pack retains original category anchors, uses 4–12 images (default eight), and allows at most 25% explicitly approved user examples. Context, source hashes, policy, role manifests and final prompts are recorded per attempt. Existing runs retain their production-policy snapshot. Rules in the assignment/profile remain mandatory; editable policy guidance supplements them.

The default style threshold is **5/5**, with at most two corrective generations per card. Settings can explicitly lower the threshold to 4 or change the repair cap. A lower threshold allows minor visible rendering deviations; it is not an exact-match claim. The native Codex tool in the tested installation rejects more than five reference file paths. Larger packs are transported as up to five sheets containing two or three complete unscaled references each. Original PNGs, the positional map and SHA-256 hashes remain in the job; no reference is silently dropped.

Card review compares the exported crop to the chosen references and original brief. Set review receives original references as well as the generated sheet. Failed reviews trigger finite corrective attempts, including set outliers, within both per-card and total image budgets. Missing reviews and exhausted retries do not constitute approval. Export validates approval; image preparation checks resolution and opacity, creates sRGB PNG outputs and retains original masters.

The professional preparation service currently requires the installed, ChatGPT-authenticated Codex CLI even when the OpenAI API image adapter is selected. Both image adapters accept the prepared reference pack. The API account's exhausted balance still prevents a real API-generation validation. Cold library indexing consumes subscription usage and can take several minutes; subsequent runs reuse its cache.

Import the complete toolbar export with `SOURCE_EXPORT_DIR="Art Sources" npm run prepare:library` (or `REFERENCE_EXPORT_DIR=/absolute/path/to/export`). With no environment overrides, `npm run prepare:library` also prefers the local `Art Sources/Файлы.json` export when present. This verifies `Файлы.json`, reads frame provenance from `Разделы.json`, preserves existing source IDs by hash, and imports individual cards only. New cards retain unknown composition categories until visual analysis; filename numbers are recorded as tags without inventing unverified set names.

To restore prepared PNGs from a source checkout, run `REFERENCE_ART_DIR=/absolute/path/to/complete-original-art npm run prepare:library`. PNGs are matched against the tracked 160-card library catalog by SHA-256, so a private Miro download manifest is not required; all catalogued originals must be available. Explicit `REFERENCE_MANIFEST=/path/to/manifest.json` selects the legacy API-manifest import workflow, which refuses to remove previously catalogued sources.

`npx tsx scripts/probe-style-preparation.ts` runs real library indexing and a reference-selection probe. Add `--generate` to generate and review one calibration image. These scripts use subscription usage and never run as offline tests.

Use `--index-only` to prepare the library without generating images. `--repair` reuses the last calibration’s references and reviewer correction, preserves image versions and permits at most two repairs.
