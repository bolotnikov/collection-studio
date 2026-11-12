# Collection Studio application architecture

This application applies the general rules in AGENTS.md and the reusable `application-architecture` skill. Game-engine scene/component conventions do not apply.

## Boundaries and presentation pattern

MVVM is implemented with React hook ViewModels and an injected `StudioApi`. Views render state and emit user intents. App, brief, settings and run ViewModels own interaction logic. `WorkspaceFeed` owns subscription lifetime and merges live updates with bootstrap snapshots without overwriting newer run state.

- `domain`: deterministic set acceptance, plan identity and user-edit invariants (`SetRules`, `ProductionRules`, `RunEdits`). No provider, React, filesystem or Electron dependencies.
- `application`: lifecycle/serialization (`RunService`), production scheduling (`ProductionWorkflow`), independent plan review/revisions (`SetPlanningService`), card generation/review/repair (`CardProductionService`), whole-set review/history (`SetReviewService`), reference retrieval and ports.
- `infrastructure`: Codex/OpenAI adapters, CLI execution, image processing, source analysis and persistence.
- `shared`: schema-validated transport/persistence contracts and localization/configuration value definitions.
- `renderer`: declarative views, ViewModels and presentation helpers. Only its composition root accesses `window.studio`.
- `main` / `preload`: Electron composition, IPC validation and OS integration. Domain mutations are delegated to application/domain rather than authored inside IPC handlers.

Interfaces are narrow where responsibilities differ (`PlanReviewPort`, `RunStore`, `ImageStore`, style/source ports). `GenerationPort` composes the model operations a production provider must implement. There is no agent framework, service locator or speculative plugin system.

## New production protocol

New runs persist `workflowVersion=planned-pilot-v1`; historical runs keep their existing protocol.

1. Select original set-level context and propose the requested number of ten-card sets.
2. Persist a shared art contract: connected story, exact category allocation, rendering/light/material rules, palette/composition rhythm, exclusions, representative pilot index and rationale. Each card has explicit material, silhouette, palette-role and composition requirements.
3. Validate the structured proposal and exact category counts. Independently review semantics, variety, style fidelity, wishes and category interpretation. Allow only the configured number of plan revisions; a rejected or unavailable review never permits image production. Persist each proposal/review. Resume partial plan review without creating a new proposal unnecessarily.
4. Index/reuse original-card analyses. Effective categories come from visual analysis. Retrieve category candidates, material/form candidates and overall relevance; keep two common original anchors and at least two original examples of the target category. Final selection includes at least four originals, at most 25% approved user examples, no duplicated image hashes and no excluded art. Inspect actual candidate images before final selection. Record roles, take/ignore instructions and source hashes. Corrections trigger fresh selection rather than reusing an unrelated cached selection.
5. Generate the pilot and verify it against originals. Failed/unknown verification pauses the set before other cards. Repairs remain bounded by per-card limits and the total image budget. Accepted pilot identity is persisted. Original references remain authoritative; the pilot is an early quality gate, not an automatically promoted library reference.
6. Produce remaining cards (default concurrency two, after the pilot gate). The accepted common contract and all planned subjects accompany each card prompt. Each card is checked; the complete ten-card contact sheet receives separate visual review and bounded targeted repairs.
7. Export requires exact-plan approval, current pilot approval, accepted card reviews and a matching whole-set review. Manual selection invalidates affected approvals and pauses a completed run for re-review.

A pilot cannot prove all four categories or guarantee whole-set quality. Whole-set evaluation remains mandatory. Separate model calls are bounded specialist roles, not necessarily separate underlying models.

## Editable configuration

- `resources/prompts/production.json`: all model instructions, including planner, plan reviewer, source/index analysts, visual selector, card/set reviewer, generation transport wrappers and correction defaults. Named `{{placeholders}}` are substituted once; template text is never executed. Missing keys or changed placeholder contracts fail before generation. Codex and API share planning and review descriptions.
- `resources/production-config.json`: plan-revision bound, minimum plan score and post-pilot concurrency.
- `resources/retrieval-config.json`: lexical field weights and category/original-source boosts.
- `resources/production-rules.json`: default authored production-policy rules; persisted/user-edited production policy takes precedence.
- `resources/style-profile.json`: canonical art rules, category descriptions and curated anchors.
- `src/shared/i18n/en.json`, `ru.json`: interface localization.

Main loads prompt, retrieval and planning configuration from resources at startup (development: repository resources; packaged: app Contents/Resources). Restart to apply edits to new runs. New profiles persist prompt and retrieval snapshots; runs persist planning/production policy. Do not change code/schema invariants such as ten cards, category coverage or approval gates merely by weakening prompt wording. Existing policy settings remain in the local workspace; default-rule changes do not overwrite them.

Analyzer cache identity includes prompt wording, model and source hash; source-set analysis also includes source-rule hashes. Exact original analyzer templates can reuse legacy caches through explicitly recorded template hashes in `legacy-analysis-prompts.json`. Edited analyzer templates cannot use that fallback. Cache reuse prevents a refactor alone from reanalyzing the existing library.

## Verification and remaining evidence

Tests cover dependency direction, transport-free views, configuration substitution, effective categories and reference roles, bounded plan revision, partial-review resume, pilot blocking, selection invalidation, export gating, subscription cleanup, historical protocols and existing storage/provider adapters. Mocked providers exercise orchestration, not artistic quality. No live image generation was performed for this refactor. A fresh real ten-card run and human comparison with the employer's originals are still required to establish end-to-end quality.

## Knowledge image organization

Prepared private knowledge images are stored by role: `resources/knowledge/images/sets/` (16 set sheets), `images/categories/1/` through `5/` (composition examples), and `images/delivery/` (4 presentation templates). `catalog.json` remains the authority for IDs, roles, category, source and SHA-256; folder names are for human navigation. Corpus decoding rejects category/role contradictions and duplicate IDs or image paths. Import retains flat content-addressed aliases in userData for historical snapshots. Reference-card metadata is inferred unless explicitly curated. Saved manual category/description takes precedence in both the gallery and retrieval; classification and artistic quality still require human judgment.

## Clean whole-set review (set-v3)

`npm run prepare:knowledge` now also runs `prepare:clean-sets`. A tracked `resources/clean-set-membership.json` records original card IDs/hashes and screenshot slot order. Preparation verifies every source hash, ranks all 160 originals against calibrated central art patches, rejects ambiguous matches or membership changes, and assembles references from original PNGs rather than screenshot crops. Beach and Road Trip have verified within-set order differences from source numbering. Calibration and the match error/runner-up error are recorded; pixel error is correspondence evidence, not an artistic-quality score. All fifteen reconstructed sheets were visually checked against the source windows.

The corpus retains 15 clean ten-card sheets under `images/clean-sets/`, with provenance and per-card use annotations. Nine original sets contain 20 gold character cards. Their complete sheets are preserved for source context, but are not positive no-gold references. Six fully ordinary sets (Gardens, Sports, Finals, Amusement, Coolness, Countrystead) are eligible as primary references. The gold-only grand-set has an explicit exclusion. Do not replace missing gold slots with invented ordinary art or silently reorder the remaining cards.

For final review, the curator selects 2–4 eligible original sets. Attachment order is candidate clean sheet, primary clean original sheets, secondary source context (one original window screenshot plus categories 1–4), then individual original rendering anchors. Planning/card context retains its existing roles. A new run with clean reference data uses `set-v3`; missing ordinary clean-sheet evidence blocks model review and export. Older snapshots retain their protocol.

`SetSheetComposer` creates both sides of the comparison: 5×2, 430×480 cards, 16px margins/gaps, neutral #eceae5 background; resulting sheets are 2246×1008. Card artwork and its background remain intact. The layout is editable in `resources/set-sheet-layout.json` and persisted in each derived sheet record. Import checks original source lineage, original-card hashes, clean PNG hashes and actual dimensions. Candidate sheet filenames include a content hash, and review history stores the exact filename and selected versions, so subsequent repairs do not overwrite earlier reviewed sheets. Delivery windows are not the primary art comparison.

## Producer-facing library and English rule editing

The library has three single-purpose views: Reference art (one curated catalog with category filters and image badges), Set references (clean set examples and optional original screenshots), and Generation rules (the active rendering rules, four composition definitions, and operative set/quality constraints). Raw board export documents, block types, URLs and recruitment/delivery instructions are not rendered as rule content. Original documents remain archived for provenance.

`resources/production-requirements.json` contains the named operative requirements shown in the rules view and passed to new production prompts. New source-analysis tasks receive these English requirements and the active English profile rather than board-export headers. Historical snapshots remain readable. Rendering prose duplicated in the generation template was replaced with instructions to follow the active editable rules.

`StyleRulesStore` persists one English `style-rules.json` in the workspace. `StyleRulesService` validates and saves it locally; there is no rule translation, bilingual copy or provider call when saving. The UI localizes labels/buttons/messages only. Canonical rendering rules and category descriptions remain English both when displayed and when supplied to models. Active runs own a profile snapshot taken before asynchronous startup; rule edits apply to later runs. Category-analysis cache identity includes the active category definitions, so changed category semantics cannot silently reuse the previous labels. Exact default definitions retain compatibility with existing cached analyses.

The art-direction field has an optional AI button. It sends a bounded text-only request using the selected provider, the set theme, existing wishes and current canonical rules, returning a short English description. The request cannot submit the generation form. Blank themes and duplicate clicks are blocked; late responses cannot overwrite manual changes. The producer can edit the suggestion before creating a set. Prompt text is in `resources/prompts/art-direction.json`.

## Unified reference curation and category-scoped prompts

`ReferenceLibraryService` owns the metadata/import use cases through narrow library and visual-analysis ports. `ReferenceLibrary` serializes mutations, imports PNG/JPEG/WebP into normalized PNG assets with bounded dimensions/file size, deduplicates content, and preserves bundled source pixels. `reference-metadata.json` stores the one authoritative English description and category override per reference ID. The existing user catalog remains readable; original provenance and supplemental influence limits are retained inside the unified catalog.

The editor offers manual category/description and an explicit AI suggestion action using the same visual librarian task and active category definitions as production indexing. AI proposals do not write metadata or replace the cached classification; Save commits the chosen values. Visual material/rendering/eligibility analysis remains separate from editorial metadata. Curated category/description is projected over cached analysis for both lexical retrieval and the visual selector; unsuitable character references remain excluded.

New run profiles snapshot the catalog, including curated metadata, before asynchronous startup. Later library edits do not alter an active or resumed snapshot. Planning sees all four category definitions. Card generation and card review receive only that card's category definition and matching category-diagram analysis; set structure and shared rendering rules remain in context. Whole-set review retains all category evidence for coverage checks.

`ReferenceEditorModel` owns editor requests, validation, duplicate prevention and disposal guards. The modal uses native dialog focus containment. The image bytes are not edited by the metadata form; UI labels remain localized and retrieval descriptions remain English.

## OpenAI image prompting coverage

The current applicable prompting contract, canonical rule source, numbered generation inputs, revision preservation and offline verification are documented in [IMAGE_PROMPTING.md](IMAGE_PROMPTING.md). Historical prompt snapshots retain their protocol.

## Audit hardening

Current requirement sections declare their applicable stages. A card's generation context includes only its composition definition and diagram, the shared contract and a compact peer subject/category/role list. Reviewers receive the actual visible brief, category definitions, threshold and input roles. Workflow/export requirements are enforced by code rather than repeated as instructions to the image generator.

Unavailable card review is retried on the existing selected attempt before any new generation. Verification prompts, numbered card-review inputs and source context are retained; set history retains its prompt and exact sheet. New image receipts bind master/preview bytes to their identities; export also verifies the reviewed clean-sheet content. Masters are real PNG/sRGB files.

New profiles freeze the reference-analysis model alongside the catalog/rules/templates. Source-analysis cache v3 fingerprints actual active rules and definitions, not just original document hashes. Old profiles retain explicit legacy-cache compatibility; new profiles require known active-rule lineage. See [pipeline audit](PIPELINE_AUDIT.md) for the reproducible offline capture and its limits.
