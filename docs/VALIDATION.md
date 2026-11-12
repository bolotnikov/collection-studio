# Validation record

Date: 2026-11-12. Local macOS Apple Silicon environment.

## Verified application behavior

- Strict TypeScript checking, ESLint, production Electron/Vite build and local ARM64 `.app` packaging pass. The bundle is unsigned; clean-machine installation/notarization is not established.
- 53 offline tests pass. Coverage includes bounded image budgets and repair, pause/resume, interrupted requests, strict review/export gates, legacy threshold migration, policy propagation to all reviewers, reference eligibility/anchor preservation, user-library promotion/persistence, visual-analysis caching, complete reference explanations, exact reference-sheet pixels/order, CLI credential isolation and localization parity.
- The packaged native window shows the two-field producer workflow, 160 source references, separate approved examples, 5/5 default style threshold, eight references and two automatic repairs. The old run remains paused with 18/30 selected images and 21 image requests.
- EN/RU switching and both Photoshop-inspired palettes were checked in the packaged app, including translated native menus and title-bar colors. Language/theme preferences survived restart. Model-authored reference annotations and producer content retain their own language.
- Every new card is reviewed; failed style reviews trigger bounded corrections. Every complete set is compared with original references. Unreviewed, failed or incomplete selections cannot be exported as production sets. Manual requested revisions remain possible within the total image budget.

## Source coverage and library analysis

The full `Art Sources/Файлы.json` export contains 185 PNGs: 160 cards and 25 collection layouts, rule illustrations and result templates. All 185 hashes were verified. The application catalog now contains all 160 individual cards, preserving the earlier 120 source identities and adding stable SHA-derived IDs for the remaining 40. The old partial Miro API manifest is retained as historical evidence and is not represented as complete.

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
