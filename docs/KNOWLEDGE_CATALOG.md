# Prepared visual knowledge

The app consumes a published `resources/knowledge/visual-catalog.json`. It contains all individual originals, the five category-example profiles, complete source-set membership and whole-set visual analyses. This is separate from the imported asset manifest (`catalog.json`) and from per-run creative selection. A normal new project reads the prepared publication; it does not catalog source images.

## Release preparation

```sh
npm run kb:sync
```

The same application service supports staged developer execution:

```sh
npm run kb:analyze-cards
npm run kb:analyze-sets
```

Both use Codex authenticated through ChatGPT. These commands perform text/vision analysis, never image generation. `--model=<model>` selects an explicit analysis model. `CATALOG_RESOURCES_DIR` and `CATALOG_CACHE_DIR` allow isolated inventories/cache directories. Default checkpoints and raw worker evidence stay under ignored `output/catalog/cache/`. Keep that folder when continuing an interrupted developer sync. Only the validated publication is shipped.

The cards stage inspects actual category sheets alongside batches of individual images. Classification records category rationale, exemplar IDs, alternatives, confidence and uncertainty. Source UI and wrong captions are not art-style authority. `source-exceptions.json` records the category-4 gold-framed rollercoaster exception. `additional-set-membership.json` records the visually checked Summer Party lineup omitted from ordinary clean-sheet preparation.

The set stage compares each complete clean sheet with its original UI screenshot and individual observations. Summer Party uses its original screenshot and all ten known members. It is retained as character-narrative evidence, not an ordinary ten-object composition template. Analysis includes semantic roles, backdrop/palette rhythm, camera/scale rhythm and cautions. Raw source images are never rewritten.

## Publication and reuse

Publication requires all expected individual IDs, all five category exemplars, every source set, ten unique ordered members per set, matching hashes and complete original-card lineage. Writes use an atomic rename. Cancellation waits for in-flight tasks to finish, retains successful checkpoints and does not publish an incomplete revision.

Per-card semantic keys include original identity/hash, model, rules, category-sheet evidence and extraction prompt. Set keys additionally include complete membership and individual observations. Published analysis keys allow a clean installation to reuse prepared results without the developer cache. An unchanged sync performs zero analysis calls. Changing one card invalidates its observation and the sets containing it; category/rule changes invalidate the dependent classification evidence. Model confidence is recorded judgment, not calibrated artistic truth.

The backdrop taxonomy distinguishes a plain field, gradient, decorative pattern, continuation of the supporting material across the field, and recognizable environmental scenery. Support, depth and context density remain independent; a football on a marked field is environmental category 4 even with few props, and category 4 can have material support or no support at all.

## Runtime composition

A new plan records ten indexed targets in `artContract.composition`, bound to the catalog dependency hash and selected source-set IDs. Each target separates required facets from preferences. Required support/backdrop/depth, pattern subtype and original-reference coverage are checked before images are requested. The plan and pilot still require independent verification.

Composition references must match the hard facets before semantic ranking and must then be visually confirmed by the reference selector. Shared rendering/material anchors can differ in composition only in a restricted role. Missing evidence is an explicit coverage error; no automatic relaxation substitutes a plain backdrop for a required patterned one.

The runtime snapshot derives counts from the selected verified versions and their **observed** facets. In-flight slots are tracked separately. A retry replaces a slot, not an accumulated counter; variant state is independent. Review-only recovery preserves image budget. Card verification must return actual composition evidence; required-facet mismatches trigger bounded corrections, and missing observations block progression. Export also checks exact selected composition evidence.

## Automatic desktop updates

There are no manual synchronization or reanalysis controls in the product. Startup checks the shipped publication and automatically processes changed source dependencies using the existing incremental caches. The shipped model and source classification rules identify the source publication; changing the generation model or editing generation prose does not reclassify unchanged source pixels. The shipped 160-card / 16-set publication matches these inputs and requires zero startup analysis calls.

Adding a reference, including approving a generated card, analyzes only missing observations using category profiles and exemplar images. Concurrent requests share one update operation. Interrupted additions resume at startup. Explicit card, category-profile and set-analysis edits are authoritative writes, without LLM reinterpretation. Counts, prototype eligibility and retrieval use the updated observations on the next snapshot. Editing descriptive metadata does not reanalyze unchanged images or rewrite historical run snapshots.

New set/category imports are analyzed once before publication. Failed card analysis leaves the image available for manual correction/removal; incomplete classification blocks new production instead of silently using unknown tags. Restart or saving/reconnecting provider settings retries outstanding work. Settings displays update readiness, progress and errors without requiring a resync button. The developer CLI remains available for release preparation.

Historical runs without a prepared catalog retain their old schemas and analysis path. No source labels or prompts in stored runs are rewritten by this feature. Supplemental user art remains subordinate to original anchors; manually described supplemental art is visually screened during reference selection rather than being invented as original facet evidence.

## Reviewed source corrections

`catalog-overrides.json` contains explicit classification decisions with original card hash, source screenshot hash, slot and rationale. They are applied separately from cached model output; the published card retains the original model category. Source/membership changes invalidate the correction rather than silently applying it to a different image. Current correction: the ordinary Gardens swan-pond illustration is category 4, not a character-narrative card solely because two birds have expressive eyes. Initial publication has 33 / 18 / 27 / 52 / 30 observations in categories 1–5. Five low-confidence classifications remain flagged for review and are excluded from reliable composition-reference coverage.

## Editable knowledge workspace

The sidebar exposes **Cards**, **Sets**, and **Categories**. Cards use an image-only grid, a category selector, and controlled abstract pattern filters. Clicking an entity opens its analysis and editing actions. Whole-set details include the ordered ten-member composition and the current pattern observations for each member. The collapsed aggregate panel reports observed min/max/mean counts for ordinary, mixed, or all source sets; these are observations, not universal quotas. Category details distinguish inferred composition variations from concrete subject descriptions.

`KnowledgeWorkspace` stores edits, imported set/category assets, and soft removals in `working-knowledge.json` under Electron user data. It overlays immutable original pixels; new production runs freeze the effective catalog, library metadata, category profiles, source-set analysis, and provenance. Removing a card excludes sets with that missing member from new generation. Source bytes and previous production snapshots remain available. Imported sets require ten declared, analyzed member cards and a visual membership check before creating their clean reference sheet.

Analysis is explicit per entity or per section. Completed entity observations are persisted atomically; cancellation retains completed work. A separate cached pattern pass distinguishes backdrop geometry, dominant background color, and subject placement without treating subject names or material nouns as pattern IDs. It also rejects contradictory patterned-backdrop/None-geometry combinations. `visual-patterns.json` defines the shared filter/edit taxonomy; generator slot contracts and retrieval use the corresponding facet IDs. Reanalysis never runs as part of opening a new project.

Generator rule editing lives in Settings. Russian rule bodies remain a single source of truth; UI labels are localized independently. The New set form defaults to one set and gold cards disabled. Enabling gold requires category 5 inside the same ten-card total while preserving categories 1–4. Ordinary categories retain their content restrictions; category 5 allows one or two acting characters. Generated illustration pixels never include UI rarity frames. Custom contradictory rules are not silently discarded.

## Verification of the workspace update

Developer synchronization completed for 160 original cards and 16 source sets. Every card has visually analyzed background color and subject position; all backdrop/pattern pairs pass the contradiction gate. Observed geometry includes concentric circles, rays, stripes, repeated motifs, waves, checkerboards and other geometric forms. A cold-cache check reused the published card/category/set analyses with zero source-analysis model calls; the theme selector was a deterministic offline fixture. The full suite passes 136 tests in 23 files, plus typecheck, lint and the macOS application build. UI checks used an isolated browser fixture with actual source/catalog data and mocked transport, covering EN/RU, dark/light, the gold checkbox, category/pattern filtering, entity details and saving. No new art was generated and no claim of measured new-generation fidelity is made.

## Classification input identity

`catalog-analysis-baseline.json` freezes the historical classification inputs used to build the shipped publication. `CatalogClassificationRules` combines that baseline with the explicit source exceptions in a stable dependency snapshot. Editable generation rendering guidance is separate: changing a lighting or material rule must not recatalog the immutable source images or block project creation. Source inventory, category/reference changes and analysis protocol changes still invalidate the relevant prepared data. Runtime readiness exposes the actual update/failure state rather than an unconditional “updating” message.
