# Collection Studio

A desktop art-production tool for collectible mobile-game card sets, built with Electron, React and strict TypeScript. Enter a theme and optional art direction, generate 1–5 ten-card variants (one by default), compare versions with source references, and export a selected set.

The interface supports English and Russian, device-language detection with English fallback, and persistent dark/light themes. Generator rules have one canonical Russian source, independent of interface language.

## Requirements and first launch

- The validated desktop platform is macOS on Apple Silicon. Other platforms are not established as supported releases.
- Use Node.js 22.13 or later in the 22.x line, or Node.js 24+, with npm. Earlier Node 22 versions do not satisfy the locked development tools.
- Image generation and model-assisted editing require an installed Codex CLI signed in with ChatGPT. Browsing the prepared knowledge base does not require a model request.

From the repository root:

```sh
npm ci
npm run build
npm start
```

A clone or GitHub source ZIP includes the prepared reference images and knowledge catalog under `resources/`. Raw `art/`, `Art Sources/`, root `references/`, private download manifests and developer caches are not required for a normal build or first launch. No preparation or source-analysis command is needed to use the supplied database.

`npm run dev` starts development mode with reloads. If dependency install scripts were disabled and Electron's binary is missing, run `node node_modules/electron/install.js` before launching.

### Connect Codex

1. Install Codex CLI and run `codex login`, choosing **Sign in with ChatGPT**.
2. Open **Settings**. If automatic executable discovery fails, enter its absolute path under **Codex executable**.
3. Choose the generation/check model: **GPT-6.1 Terra** by default, or **GPT-6.1 Sol**. The separate **Collection planning model** can use either model or inherit the generation model.
4. Save settings, then click **Test connection**. The test uses the saved executable settings and checks CLI discovery and ChatGPT authentication; it does not generate an image or establish image-tool compatibility.

The adapter was calibrated with CLI `0.167.0-alpha.4.1`. Compatibility with another installation should be checked using the optional [live calibration](#maintenance-and-live-calibration) before production work.

Codex uses its saved login and subscription limits. Image requests, planning and visual analysis all consume provider usage. Image quality is a prompt preference, not a guaranteed low/medium/high image API parameter. The application has no API-key generation provider.

## Producer workflow

1. Open **New set**, enter the theme and optional art direction, and choose 1–5 variants. **Include gold cards** is off by default. The **AI** button can draft a short English art direction from the theme and current wishes; this makes a model request.
2. Start generation. Each variant contains exactly ten subjects and all four ordinary composition categories. Gold-enabled sets additionally include category 5 within the same ten-card total. Multi-variant planning checks subject uniqueness across the batch.
3. Open a card to inspect its selected image, the references actually used for that version, prompt metadata and version history. Choose an earlier version, regenerate, or lock the selection. **Approve and save to library** adds the selected image as a supplemental user reference; approval is not required for delivery.
4. Use **Pause** to stop scheduling new work. Already-running requests may finish; the current image worker pool has two workers. Wait for the run to become inactive before editing selections or deleting it. **Resume** retains saved images. A restart pauses interrupted runs and records unfinished image requests as having an unknown outcome; work resumes only on an explicit user action.
5. Choose a variant. With multiple variants, **Select for delivery** records the preferred one. **Export set** exports the currently displayed complete variant. Game-window previews also have individual PNG download actions.

### Manual revisions and slot tags

In the card drawer, **Regenerate image** with empty instructions creates a fresh version. Nonempty **Revision instructions** use the selected stored master as the edit base. Earlier versions remain available.

Slot tags are editable while the run is inactive and the card is unlocked. Save tag changes before regenerating; saving alone does not redraw the card. Removing a tag removes that requirement, so write prohibitions in the revision instructions. Category-defining constraints and character restrictions stay fixed. Tag edits, reference selections and per-version target snapshots are persisted without rewriting earlier images or reviews.

### Verification, corrections and request limits

Settings expose two independent limits, both **0 by default**:

| Setting                                    | At 0                                                         | At a positive value                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Maximum corrections per card               | Skips card model verification and automatic card corrections | Checks generated cards and permits bounded corrections for confirmed subject, silhouette, character, category or background defects      |
| Maximum correction rounds after set review | Skips whole-set model verification and corrections           | Checks the selected 5×2 grid and permits bounded rounds of targeted relationship corrections, checking the updated grid after each round |

The card limit applies to each initial/manual generation chain. A whole-set limit of N rounds permits one initial check plus up to N checks after correction rounds. These settings are saved in each new run. Changing Settings does not overwrite an existing run's policy. Automatic corrections retain earlier versions and identify their exact previous candidate. Locks, saved attempt identities and the shared image-request budget remain enforced. Artistic scores are not used; uncertainty and unresolved observations remain in **Diagnostics** and do not block current-protocol delivery.

Technical image failures are retried independently of these limits, using the same prompt and references, until an image is saved, the user pauses, or the image-request budget is exhausted. Failed image requests consume that budget and are recorded in diagnostics.

Open **Diagnostics → Production log & limits** to adjust the image-request limit while the run is inactive, up to 150 requests. This counts application image requests, including technical retries and revisions; it is not a monetary cap or an exact count of native Codex tool calls. Planning and verification calls are outside this image counter.

Historical runs retain their saved evidence. Explicitly resuming or regenerating an archived run can activate the current protocol and records that transition. Historical strict-mode export gates apply until the run's protocol is explicitly transitioned. See [composition-only production](docs/COMPOSITION_ONLY_WORKFLOW.md).

## Knowledge base and generation

The collapsible **Knowledge base** group contains:

- **Cards**: source and supplemental reference art, category/pattern filters, descriptions, classifications and entity analysis/editing.
- **Sets**: ordered source-set membership, composition observations and aggregate statistics.
- **Categories**: composition examples and each category's canonical generation rule.
- **Style**: shared editable rendering rules and operational image guidance.

Cards, Sets and Categories support source-entity additions and removals. Source bytes and historical run snapshots are retained. Knowledge edits apply to subsequent production snapshots. Opening a new project reuses prepared source analysis; it does not reanalyze the unchanged library. Missing or changed source observations can require model analysis, with readiness and errors shown in Settings.

The current production sequence is:

```text
Prepared source catalog
  → deterministic category/pattern, color and 5×2 grid planning
  → frozen structurally matching original references per slot
  → one structured set-design request, with bounded structural retries if needed
  → ten images through the same worker pool
  → optional card and whole-grid verification/corrections
  → user version selection and export
```

Planning uses aggregate source statistics rather than copying one source-set layout. New rhythm contracts forbid repeated color-family/pattern pairs and equal color families in horizontal or vertical neighbors. These are product constraints, not claims that every original source set follows the same rules.

Each initial slot has at least two and at most eight matching original card references. Current catalog-based selection does not add a separate vision-reranking call for every card. Applicable category figures and revision bases have explicit input roles. Larger input packs are transported in complete, unscaled reference sheets to fit the adapter's five-path image-tool limit, retaining mappings and hashes. Delivery templates are not style references.

## Export

For the current `composition-v1` protocol, export requires ten selected image versions and an inactive run. Successful artistic reviews or manual approval are not prerequisites. Image-file integrity is checked during export.

The desktop production ZIP contains:

- `cards/01.png` … `10.png`: 430×480 sRGB PNG crops;
- `masters/01.png` … `10.png`: full-resolution stored PNG masters, normalized to sRGB when saved;
- `history/<card-id>/<attempt-id>.png`: previews for all saved versions, including the selected version;
- `contact-sheet.png`: the selected grid;
- `delivery/`: game-window composites and their selection manifest;
- `selection.json`, `run.json`, `style-profile.json` and `report.md`;
- `journal.md` and `diagnostics.json`: execution narrative and sanitized diagnostic evidence.

Historical protocols may also include `quality-warnings.json`. Individual source-reference files and Codex authentication files are not copied into the delivery ZIP. Game-window composites do retain the supplied template artwork and captions. Run/profile metadata contains the brief, prompts, source identities, model identifiers, attempts, selections and stored observations.

**Download execution log** is available for inactive projects and exports a Russian chronological journal. **Diagnostics → Download diagnostics** exports sanitized run/profile/journal JSON. Missing historical evidence is identified rather than reconstructed. Stored request/response text retains its original language.

## Resources and local data

`resources/` is the canonical build source for supplied reference assets. The prepared corpus contains 200 unique PNG files:

| Location                                          | Contents                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `resources/references/`                           | 160 hash-verified original card PNGs                                                                                       |
| `resources/knowledge/images/`                     | 25 contextual images: 16 source-set windows, 5 category figures and 4 delivery templates; plus 15 derived clean-set sheets |
| `resources/knowledge/catalog.json`                | Seven source documents, contextual image provenance and clean-set membership                                               |
| `resources/knowledge/visual-catalog.json`         | Published card, category and 16-set visual analysis                                                                        |
| Other `resources/*.json` and `resources/prompts/` | Default profile, canonical rules, validated planning policies, layouts, taxonomies and prompt templates                    |

Clean sheets and source screenshots serve different purposes; individual card membership points to the canonical card files. Raw `art/` / `Art/`, `Art Sources/`, and root `references/` / `References/` remain ignored maintenance inputs. The supplied art retains its original usage and redistribution restrictions.

Electron user data holds settings, edited rules, working knowledge, imported references and project history. Runs default to its `runs/` directory. Set `COLLECTION_STUDIO_DATA=/absolute/path/to/runs` before launch to relocate runs and their worker evidence; this does **not** relocate all settings or knowledge edits.

Each run retains `run.json`, a profile snapshot, stored image versions, contact sheets and `execution.jsonl`. Project Codex requests live in that run's `_jobs/`; non-project operations use separate directories such as `_codex-jobs/`, `_catalog-jobs/` and `_knowledge-jobs/` under the runs root.

For backup or transfer, close the app and preserve the entire Electron user-data directory, plus any custom runs directory. A delivery ZIP is an export of a selected set, not a complete backup of the editable workspace. Deleting an inactive project through its confirmed Trash action moves its complete run folder to the system Trash; shared library references and separately exported files remain.

## Development and validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Offline tests cover planning contracts, reference identity and resource completeness, image integrity, budgets, corrections, pause/resume, interruption, historical protocols, localization and exports. Test images and provider responses are fixtures; passing tests does not establish generated-art quality.

### Local macOS bundle

```sh
npm run package:mac
```

On the validated Apple Silicon platform this creates `release/mac-arm64/Collection Studio.app`, including the prepared resources. It is an unsigned local build; notarized distribution and clean-machine installation are not established. Keep one current bundle at that path. Perform temporary packaging outside `release/` and replace the canonical bundle only after successful checks.

### Maintenance and live calibration

These commands are not part of first launch:

- `REFERENCE_ART_DIR=/absolute/path/to/originals npm run prepare:library` restores all catalogued card PNGs by SHA-256. Importing an updated full toolbar export instead uses `SOURCE_EXPORT_DIR=/absolute/path/to/export npm run prepare:library`.
- `SOURCE_EXPORT_DIR=/absolute/path/to/export npm run prepare:knowledge` imports source documents/context images and rebuilds clean-set sheets. The full export must contain `Файлы.json` and `Разделы.json`.
- `npm run prepare:references` restores only the eight legacy curated anchors from local originals/manifest; it does not restore the full library or knowledge publication.
- `npm run kb:sync` updates and publishes prepared visual analysis. The staged commands are `npm run kb:analyze-cards` and `npm run kb:analyze-sets`. These use Codex text/vision requests and subscription usage, but do not generate artwork. Preserve incremental checkpoints under `output/catalog/cache/` when continuing maintenance. See [prepared knowledge](docs/KNOWLEDGE_CATALOG.md).
- `npm run calibrate:codex` uses GPT-6.1 Sol to generate one reference-guided calibration image and perform a legacy-style visual review. It consumes subscription usage, writes to `output/codex-calibration/`, and does not exercise the complete current set-production workflow.

Preparation commands can rewrite tracked catalogs and assets; review the resulting changes together before distribution. Ordinary tests and builds do not invoke live calibration or image generation.

## Architecture and further reading

```text
React views / ViewModels → typed preload bridge → validated Electron IPC
                                                       ↓
                                           Application use cases / ports
                                                       ↓
                                            Domain rules and invariants

Electron composition supplies Codex, filesystem, image and export adapters.
```

Domain/application code does not depend on React, Electron or concrete providers. The renderer has no Node integration; filesystem and provider operations cross the validated IPC boundary. Prompt text and tunable production policies live in validated JSON resources. Model output is decoded before use; image rendering and visual observations remain probabilistic.

Codex workers run `codex exec` without a shell, in per-request workspaces with `workspace-write` sandboxing. App connectors, plugins, shell tools and agent delegation are disabled. `OPENAI_*` and `CODEX_API_KEY` environment variables are filtered; the app relies on CLI-managed ChatGPT authentication rather than copying login tokens.

- [Current composition workflow and corrections](docs/COMPOSITION_ONLY_WORKFLOW.md)
- [Aggregate composition planning](docs/AGGREGATE_COMPOSITION_PLANNING.md)
- [Application architecture](docs/APPLICATION_ARCHITECTURE.md)
- [Image-prompting requirements](docs/IMAGE_PROMPTING.md)
- [Execution evidence and exports](docs/EXECUTION_LOG.md)
- [Prepared knowledge and maintenance](docs/KNOWLEDGE_CATALOG.md)

Research, implementation plans and earlier validation records in `docs/` preserve historical decisions and may describe superseded protocols. They are not instructions to enable old artistic scoring, review gates or HTTP providers for new runs.

Official provider documentation: [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), [image generation and usage](https://learn.chatgpt.com/docs/image-generation), and [non-interactive execution](https://learn.chatgpt.com/docs/non-interactive-mode).
