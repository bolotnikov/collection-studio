# Validation record

Date: 2026-11-12. Local macOS Apple Silicon environment.

## Verified application behavior

- Strict TypeScript checking, ESLint, production Electron/Vite build and local ARM64 `.app` packaging pass. The bundle is unsigned; clean-machine installation/notarization is not established.
- 61 offline tests pass. Coverage includes bounded image budgets and repair, pause/resume, interrupted requests, strict review/export gates, legacy threshold migration, policy propagation to all reviewers, reference eligibility/anchor preservation, user-library promotion/persistence, visual-analysis caching, complete reference explanations, exact reference-sheet pixels/order, CLI credential isolation and localization parity.
- The packaged native window shows the producer workflow with a set-count field (default one), 160 source references, separate approved examples, 5/5 default style threshold, eight references and two automatic repairs. The old run remains paused with 18/30 selected images and 21 image requests.
- EN/RU switching and both Photoshop-inspired palettes were checked in the packaged app, including translated native menus and title-bar colors. Language/theme preferences survived restart. Model-authored reference annotations and producer content retain their own language.
- Every new card is reviewed; failed style reviews trigger bounded corrections. Every complete set is compared with original references. Unreviewed, failed or incomplete selections cannot be exported as production sets. Manual requested revisions remain possible within the total image budget.

## Source coverage and library analysis

The full `local-sources/miro/export/Файлы.json` export contains 185 PNGs: 160 cards and 25 collection layouts, rule illustrations and result templates. All 185 hashes were verified. The application catalog now contains all 160 individual cards, preserving the earlier 120 source identities and adding stable SHA-derived IDs for the remaining 40. The old partial Miro API manifest is retained as historical evidence and is not represented as complete.

Full export import and portable restoration were repeated successfully. A partial legacy import cannot silently remove existing catalog entries.

Ten known character/gold-rarity cards are excluded before indexing. All remaining 150 cards have cached visual analyses. The final catalog has 128 eligible object references and 32 excluded narrative/character cards in total. The raw sources remain intact. One early analyzer mistake confused a gold medal material with gold-card rarity; the instruction was clarified and that record was reanalyzed. The medal is now eligible. Classification is model-derived, not an employer-supplied ground truth.

## Real style preparation and generation

The installed native Codex CLI `0.167.0-alpha.4.1` is authenticated with ChatGPT. No API key is passed to its child processes. The OpenAI Images API adapter remains unvalidated for generation because the account returned `429 no credits remaining` during its earlier live request.

A real preparation run analyzed the brief, visually ranked twelve candidates and recorded concrete roles, take/ignore instructions and reasons for all eight selected references. The initial attempt to pass eight separate paths was rejected by the native tool with `referenced_image_paths must contain at most 5 paths`. The adapter now packs larger selections into complete, unscaled reference sheets; this is transport, not additional generated art.

The repeated generation successfully used eight selected references transported in three sheets. The originals, positional mapping and hashes are saved in each job. Native CLI JSONL does not expose all internal image-generation arguments, so provider-internal attention to every reference cannot be independently verified.

The first generated fedora received style 4/5, readability 5/5 and subject match 5/5. The reviewer identified excess felt stippling relative to smoother source rendering. The new default threshold is 5/5; that result is insufficient under the strict policy. A targeted correction reused the same reference pack, preserved the first version and produced a second image scored 5/5 on all three criteria, with correct category. Manual inspection confirmed smoother surfaces, a complete brim and retained object/background separation. These scores are model judgments, not proof of exact equivalence or full-set quality.

Evidence remains local:

- `output/style-preparation/preparation.json`: selected references, roles and assembled prompt.
- `output/style-preparation/catalog-analysis.json`: current analyzed source catalog.
- `output/style-preparation/repair-history.json`: both calibration reviews and image paths.
- `output/style-preparation/review.json`: latest strict review, transport metadata and policy.
- `output/style-preparation/images/style-probe-fedora.png`: first calibration image.
- `output/style-preparation/images/style-probe-fedora-a58f28c3-8a78-4625-a8f9-804810f6eb1e.png`: corrected 430×480 image; unchanged master alongside it.
- `output/style-preparation/jobs/`: prompts, schema-validated responses, reference packing manifests and diagnostics.

The calibration script performs bounded targeted revisions. Automatic production orchestration was verified by integration tests; a complete fresh thirty-card run under the strict policy has not yet been rendered.

## Remaining assignment evidence

- Ninety candidate images / thirty selected finals across three cinema genres.
- Human art-review calibration across all four composition categories and comparison with complete original sets.
- A matched benchmark against another accessible public image model. Public source research is not a Scenario quality benchmark or access to its private backend.
- Final Miro result placement and GitHub publication.

No source reference, synthetic test fixture, incomplete set or single calibration card is represented as a completed assignment deliverable.

## Complete source-context upgrade

All seven exported descriptions and 25 contextual images now have roles, source links and SHA-256 checks. Real visual analysis completed for all sixteen source set layouts and five composition figures. The three operative documents are provided verbatim; selected set examples and category figures are attached according to their roles. Category 5 is analyzed as a negative example; delivery templates are not generation references.

`output/source-context/context.json` records the selected originals and reasons. A real review of the existing ten-card detective sheet (`candidate-set.png`) returned style compatibility 3/5, thematic cohesion 4.5/5, palette balance 3.5/5 and composition balance 3.5/5. It rejected the set, identified concrete rendering/framing issues and supplied corrections for all ten card IDs. The full result is in `output/source-context/set-review.json`. This inspection made no image-generation calls and did not alter run selections or run metadata.

New tests exercise corpus roles, cache reuse, source hash failures, propagation through planning/card/set stages, targeted whole-set repairs, version-bound export approval and the default one-set/ten-card run. The complete new workflow has not yet rendered a fresh ten-card production set; the live source-aware review used historical art.

The rebuilt native app was checked after restart: New Set defaults to one and displays ten cards; changing the count to two displays twenty, then it was restored to one. Rules and sets exposes original documents, sixteen set images and five composition figures. No image generation was launched during these UI checks.

## Application architecture and reviewed-pilot protocol — 2026-11-12

- `npm run typecheck`, `npm run lint`, and all **75 tests in 13 files** passed after the refactor. `npm run package:mac` completed successfully.
- Added deterministic plan allocation/identity checks, independent model plan review with bounded revisions, resumable partial planning, per-set pilot gates, category-aware reference roles and shared original anchors. Tests cover failure, pause/resume, manual-selection invalidation and export rejection.
- React views use injected ViewModels; architecture tests enforce dependency direction and prevent direct transport access in views. WorkspaceFeed lifecycle tests cover subscription cleanup and stale bootstrap responses.
- Model prompt prose is in the JSON catalog with named placeholders. Packaging includes editable prompt, planning and retrieval configuration. Analyzer caches reuse legacy results only for the recorded exact original prompt templates.
- The new `application-architecture` skill passed its bundled validator. General project rules are in root AGENTS.md.
- No image generation was launched for this refactor. The new full protocol has offline coverage, not fresh end-to-end artistic acceptance.
- Native inspection found an existing user-started “Кино-коллекция” run showing 6/10 cards, 15 image requests and a pending pause. The app was not quit or restarted to avoid interrupting that work. Therefore the newly packaged UI was not validated in a fresh native process; it takes effect on the next app launch.

## Organized knowledge corpus — 2026-11-12

Prepared all 25 contextual images into role/category folders and verified each SHA-256 against the source manifest: 16 set sheets, 5 category examples, 4 delivery templates. No flat PNG copies remain in the prepared image root. Source originals are preserved. New tests reject inconsistent role/category pairs and duplicated image identities/paths, and prove organized imports retain legacy flat addresses for historical profiles. Typecheck, lint, **77 tests in 13 files**, and macOS packaging passed. No live generation was performed.

## Clean reference sheets — 2026-11-12

- Reconstructed 15 complete reference sheets from 150 original standalone PNGs. All memberships were checked against all 160 originals using calibrated pixel-patch matching, recorded in the manifest and visually compared with the fifteen source screenshots. Verified the reordered Beach and Road Trip slots. Original screenshots and art remain intact.
- Marked 20 gold-character slots across nine mixed sets; six complete ordinary sets are primary-eligible. The gold-only grand-set is excluded explicitly. No generated replacement images were used.
- Candidate and reference sheets use the same composer and 2246×1008 layout. Whole-set review v3 receives clean references first, retains secondary UI context, records versioned candidate sheets, and fails closed without clean provenance.
- `npm run typecheck`, `npm run lint`, **85 tests in 14 files**, `npm run prepare:knowledge`, and `npm run package:mac` passed. New tests cover exact tile order/corners, pixel correspondence and ambiguity, clean-reference ordering, gold exclusion metadata, lineage/layout corruption, import and v3 export gates.
- A real offline import of the full private corpus succeeded: 7 documents, 25 original context images, 15 derived sheets, 6 primary-eligible sets, 150 original card memberships. Source data were regenerated reproducibly; packaged corpus hashes were checked separately.
- No live model generation or new artistic-acceptance run was performed. Existing user runs were not resumed or modified. The current application was not restarted; the new protocol becomes available in the rebuilt app on the next launch and applies to new runs.

## Producer tools and focused style library — 2026-11-12

Typecheck, lint, 91 tests in 15 files and macOS packaging passed. New coverage checks theme/wishes-aware AI description requests, duplicate/stale-response handling, English-only local rule persistence/reload, category partitioning, removal of export/recruitment metadata from operative prompts, and rule snapshots across asynchronous run startup. There is no translation call or language-specific rule copy; labels and messages retain EN/RU localization.

The rebuilt native application was restarted after confirming all existing runs were paused. Verified the four mutually exclusive library tabs, the 28-card category-1 filter and top-right image badges, empty approved examples, named primary/context set references, and English rule bodies/editor under Russian UI. Cancel left the canonical rules unchanged. One real text-only AI request for the detective-cinema theme returned a short English art direction and preserved the default one-set count. No image generation was started and no existing run was resumed. Screenshots are in `output/ui/new-set-ai.png`, `style-library.png`, `set-references.png` and `style-rules.png`.

## Unified reference curation — 2026-11-12

Typecheck, lint, **101 tests in 16 files**, and macOS packaging passed. New tests cover category-scoped generation/review context, manual metadata precedence over cached analysis and retrieval category selection, immutable pixels/provenance, serialized edits, persistence/reload, bounded PNG/JPEG import and deduplication, invalid image rejection, editable AI proposals, cancellation/disposal, and rule/catalog snapshots across asynchronous run startup.

The rebuilt native app was restarted with all three existing runs paused. Verified the unified Reference art tab (160 originals, no separate approved-examples tab), per-image editor, category selector, English description, and native file-picker cancellation. A real visual AI call on one existing source image proposed category 1 and an English description. Cancelling retained the original description; neither the proposal nor the file-picker cancellation added or changed references. Screenshots: `output/ui/reference-editor.png`, `output/ui/unified-library.png`. Actual metadata persistence/import are covered offline; no test images or arbitrary category edits were left in the user's library. No image generation or run resumption was performed.

## Full offline pipeline audit — 2026-11-12

Integrated the parallel OpenAI image-prompting changes and corrected review/context/cache/export gaps. Typecheck, lint, **114 tests in 18 files**, and macOS packaging passed. The real-data offline capture verified 160 reference hashes, 25 context images, 15 clean sets and 150 original-card memberships; ten generation packets each preserve eight references plus one matching diagram in three packed inputs. It made **zero model calls and zero image generations**, used deterministic decision fixtures and replayed archived observations into an isolated cache. The latest evidence is `output/pipeline-audit/report.json`. See `docs/PIPELINE_AUDIT.md` for findings, gate coverage and limits.

The packaged native app was restarted with three existing runs paused; it loaded successfully and retained the producer's selected theme and one-set count. No AI action, generation or resume was invoked. Startup proof: `output/ui/audit-ready.png`. Existing source pixels and library metadata were not changed.
