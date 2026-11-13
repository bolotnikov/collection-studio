# Production polish implementation

Status: implementation started on 2026-11-12. The audit below remains historical evidence; its proposed changes are not all implemented. No fresh image generation is authorized by this implementation pass.

## Delivery and focused results UI — implemented, verified offline

- Show the ten selected cards and a concise acceptance/pending/needs-attention status. Move numeric scores, model findings, art contracts, reference reasoning and events into an optional diagnostics dialog with independent JSON download, available even for failed runs. Preserve all verification/export gates.
- Compose approved cards deterministically into all four existing transparent Delivery windows; show a four-preview comparison and full-size view. Keep the raw-card view. Include the four PNG presentations and their input/selection/template identities in the production archive.
- Validate original template hashes, dimensions and slot geometry; keep source PNGs unchanged. Templates contain baked-in example headings/captions/counters, which are not generated artwork or a claim of live game state. Do not use these UI previews as clean style-verification inputs.
- Invalidate presentation on selected-version changes. Test slot placement, alpha, order, source integrity, approval gates and archive contents offline.

Implementation evidence: `DeliveryReadiness` shares the existing export gate with UI and presentation; `DeliveryComposer` fills ten configured openings beneath immutable source PNGs; `DeliveryPreviewService` verifies source/selected-image hashes and produces all four windows. Production export includes the presentations and a manifest. `RunDiagnostics` moves findings, scores, planning details and events into a separate modal with an independent JSON download. Individual-card scores are collapsed by default.

Verification: 117 tests passed, including all four templates with ten distinct synthetic slot colors, alpha/order/export checks and rejection of failed/stale/tampered selections. The isolated in-app browser fixture verified the uncluttered results screen, diagnostics open/close and enlarged template preview. Fixture acceptance was simulated; no actual failed run was approved or resumed. Existing cinema art was composed offline for visual placement checks only. Template headings/captions/counters are baked into the original PNGs and remain unchanged. The broader algorithm/catalog roadmap below is still pending unless a later status says otherwise.

## Recovery fixes — implemented, verified offline

- Persist plan-review transport failures separately from content validation errors. A failed review stops the run with its saved proposal and completed variant reviews intact. Resume retries the unfinished review once; a transport outage does not consume a plan-repair slot or trigger image generation. Historical validation errors are not reinterpreted.
- Before resuming a rejected pilot or ordinary card, derive the correction from its selected attempt's review. Pass that correction into preparation and generation, and bind the selected previous candidate through the existing revision-input protocol. Explicit user corrections take precedence. Unavailable reviews continue to retry verification without redrawing.
- Regression coverage: repeated plan-review outages with zero content-repair allowance; resumed corrections for pilot and ordinary cards; existing unavailable-review recovery tests. These changes do not alter the style rubric or prove improved generated-art quality.

Combined verification after these changes: 120 tests across 19 files passed; TypeScript typecheck, ESLint, production build and whitespace checks passed. No production run was resumed and no model/image generation was performed.

## Agreed algorithm and catalog roadmap

### Implementation update — published visual catalog and slot composition

Implemented and initially executed the explicit catalog pipeline (`kb:sync`, `kb:analyze-cards`, `kb:analyze-sets`). The private publication under `resources/knowledge/visual-catalog.json` includes 160 originals, five visually analyzed category sheets, 16 source sets, all source documents/image identities and whole-set profiles. Summer Party's ten members were visually checked and retained as character-narrative source material. Category-4 gold-frame source exception is recorded by hash/slot. A focused taxonomy review distinguished material-surface continuation from environmental scenery. The swan-pond classification was explicitly curated to category 4 with source screenshot/slot evidence and retained model-category provenance. Five remaining low-confidence observations are visible and do not silently qualify as reliable composition evidence.

Runtime new-project creation now requires the prepared publication and snapshots it. Card/source initialization reads published observations rather than performing source analysis. Theme-specific planning, selection and independent checks remain legitimate model work. Settings exposes local readiness, explicit background resync, progress and cancellation. Successful per-card/set checkpoints and shipped analysis identities support incremental reuse; complete publication is atomic. The same application service drives CLI and Settings.

New plans bind ten indexed composition targets to an effective catalog revision, keeping required versus preferred facets separate. Mandatory category/support/backdrop/depth and pattern requirements, complete slot coverage and matching-original-reference availability are checked before image calls. Weighted semantic ranking runs after the composition filter, followed by actual-image confirmation. Rendering-only references cannot satisfy required composition coverage. Missing matching evidence is an explicit error.

Selected accepted versions and observed composition facets determine the current set state. Retries replace a slot; in-flight reservations and independent variant snapshots avoid accumulating duplicate counts. Missing observation evidence blocks pilot/downstream production; observed facet mismatches yield bounded corrections with the previous image. Native provider schemas require the new contract/observations when a prepared catalog is present. Exact-version export also checks composition evidence. Manual metadata edits reach original manifests, retrieval and composition planning through a separately versioned frozen catalog projection; published originals remain unchanged.

Verification: 131 tests, typecheck and lint passed. Behavioral checks cover complete/unchanged/incremental cataloging, cold-cache seed reuse, cancellation, metadata snapshot isolation, exact patterned-reference filtering, selected-version counters and pilot recovery on missing/wrong composition observations. Actual developer resync created zero new model jobs after preparation. An isolated cold-installation check of the real publication recorded zero source-analysis calls (theme-selection transport was an offline fixture). In-app browser checks covered the gallery tags and Settings sync/cancel UI. The macOS application bundle includes a byte-identical prepared catalog and the additional membership file. No new images were generated or historical production runs resumed.

Still pending: the end-to-end Include gold cards generation option (category 5 is already cataloged/editable); broader human-labeled artistic/retrieval evaluation; optional verified-pilot conditioning experiment and final assignment generation under separately authorized image scope. The current implementation does not prove perfect artistic fidelity or calibrated model confidence.

### Implementation update — canonical metadata and reusable preparation

- New runs resolve original-reference titles/categories and the full library from one read-only effective catalog. The resolved metadata is frozen in the run profile for planning, retrieval and input manifests. Original IDs, hashes and paths must still match. Existing run profiles are untouched. The pending readiness/catalog work must distinguish unanalyzed defaults from visually validated labels; this update alone does not certify the full library.
- Completed card preparation, producer interpretation and source-set selection are persisted atomically under semantic keys. Keys include relevant model/prompts/rules/source metadata and hashes, card/peer/contract requirements and corrections. Evidence timestamps do not invalidate identical preparation. Stored card-reference paths, membership and bytes are verified before reuse. Failed tasks are evicted from in-memory maps, and invalid selection results cannot be published as successful checkpoints.
- New plan proposals reject stage-specific numbered-image references inside the persistent art contract; stage manifests retain responsibility for actual numbered attachments. Historical contracts are not rewritten. The offline audit supports an explicit `--run=<uuid>` and otherwise selects the newest complete ten-card plan.
- Rule settings migrate to revision 2: unchanged standard rendering guidance becomes Russian; categories 1–4 use the substantive Miro clauses verbatim. Rendering guidance is authored operational guidance, not a source quotation. The previous settings are retained in a content-addressed backup. Custom fields are preserved, with a visible reconciliation notice. UI locale does not translate stored rule bodies. This migration covers rendering/category settings; optional category-5 production and other policy changes remain pending below.
- Regression coverage includes effective metadata snapshot isolation, restart reuse despite timestamps, correction invalidation, source-byte tampering, Russian rule persistence/migration and rejection of cross-stage positional references. No real model calls or generated artwork were used to establish these deterministic checks.

Remaining major work: structured source/category/set observations and lineage; reviewed ten-slot visual targets and observed-state composition control; developer catalog analyzers, a complete shipped publication and optional Settings sync; gold mode; human-labeled evaluation. The catalog has not yet been reanalyzed or certified under the new rules, and artistic fidelity has not been re-evaluated.

Verification of this update: 124 tests in 20 files, typecheck, lint, production build and whitespace checks passed. Existing production runs, generated art and model caches were not migrated by tests; migration was exercised in isolated temporary directories. The app applies rule migration on its next initialization.

# Generation readiness review — 2026-11-12

Reviewed commit: `69f1a1feab8cd10a1fcd689a0ff3b4bfc3cdf354`, pushed to `origin/main` before this audit. No application source, configuration, production data or model cache was changed during this review. No image generation or external model call was made. Research used public documentation and source code. Audit artifacts below are local and excluded from Git.

## Verdict

The architecture is a credible reference-guided production workflow. It does not yet justify a claim of autonomous, consistently production-quality art. The remaining work should focus on correct recovery, canonical reference metadata, measurable whole-set composition, reusable preparation with honest progress reporting, and empirical artistic acceptance. A new agent framework, vector database or broad architectural rewrite is not justified by the evidence.

Distinguish three outcomes: deterministic workflow correctness, stylistic similarity between the ten generated cards, and fidelity to the original game's art. Passing one does not establish the others. In particular, a consistent generated set can consistently miss the original style.

## Findings, ordered by importance

### P1 — Resuming a failed card loses the corrective edit context

`src/application/ProductionWorkflow.ts:157–176` schedules a previously reviewed but rejected card and calls `produce()` without an instruction. `CardProductionService.ts:32–48` builds a new request from that empty instruction; it recovers unknown reviews, but does not recover the correction from a completed failed review. `GenerationRequestBuilder.ts:51` consequently omits the previous candidate image.

Trigger: pause before an automatic repair, or exhaust the image budget, increase it and resume. The next image attempt can repeat the original brief instead of correcting the already observed defect. The global image limit still applies; this is an efficiency and recovery defect, not an unbounded loop.

Offline reproduction through the actual production service, with transport intercepted before any image is produced, confirms that neither a unique stored correction nor the selected previous master reaches the image request. See `reproduce.ts` and `reproductions.json` in this directory.

Required change: persist/derive an explicit next action (generate, verify saved candidate, correct rejected candidate, review set, stop). A resumed correction must retain the rejected attempt ID and correction, and must not consume another image call for a verifier transport error. Apply the same decision rules to pilot and ordinary cards.

### P1 — Transient plan-review outages consume plan-repair allowance and prevent recovery

`src/application/SetPlanningService.ts:21–45` stores review transport errors in the same `errors` array as invalid plans. The next iteration produces another plan. At the default maximum of one plan repair, two temporary verifier errors exhaust both proposals. Resume returns `null` without contacting the now recovered reviewer.

Offline reproduction confirms two proposals and two failed review calls, followed by zero additional review calls after recovery. Images are safely blocked, but the user cannot recover the accepted-shape proposal through Resume.

Required change: separate invalid/rejected proposals from interrupted verification. Retry the saved unreviewed proposal after transport recovery; consume plan repairs only for invalid content or an actual negative judgment. Bound transport retries separately and retain resumable state.

### P2 — Reference metadata still has two effective authorities

Card preparation resolves effective category/description from the analyzed, manually overridable library (`CodexStylePreparation.ts:293–315`). Planning and whole-set input manifests read `profile.references` directly (`PromptBuilder.ts:139–143`); starting a run snapshots `library.items` but does not reconcile those anchor records (`src/main/index.ts:226–230`).

Observed discrepancy: original Calculator ID `3458764679576006337` is category `1` in `resources/style-profile.json`, while the cached analysis says `2`. This observation proves disagreement, not which label is artistically correct. Manual library edits can similarly fail to reach the planning/set manifests.

Required change: resolve every reference ID against one effective metadata snapshot for a new run. Keep the fixed anchor membership/authority separate from duplicated category descriptions. Preserve the original source metadata and all historical snapshots. Add a regression where editing one anchor's category/description updates every new-run consumer and leaves an older run unchanged.

### Release evidence gap — The verifier is not calibrated against human acceptance

The current rubric explicitly addresses shape simplification, edges, material response, lighting and background detail; current default style threshold is `5`. These are sensible controls. However, there is no held-out, human-labeled evaluation suite measuring false acceptance, false rejection or agreement on stylistic mismatch. `scripts/calibrate-codex.ts` is a one-image generation smoke test, not that evaluation suite.

I inspected the original Finals clean sheet, original cap/sandcastle cards and two historical generated examples. The older banker's lamp (`ea182e4d-3ba4-423e-ab00-76e56d406cb8`, selected attempt `a979c7e6-7407-422f-8897-ba66afe016ad`) visibly has darker dramatic lighting, more realistic glass/metal and denser texture. Its legacy review accepted it with style `4`; the current default threshold `5` would reject that recorded score. The later red telephone is closer in rounded construction and broad highlights. This is a qualitative spot check, not a benchmark, and neither image proves the current pipeline's quality.

Required next evidence: curate accepted/rejected/borderline historical images across all four categories, annotate why, and reserve a held-out subset. Include good-looking but wrong-style art, photographic material drift, clipped silhouettes and internally coherent but stylistically wrong sets. Measure false accepts, false rejects, reviewer stability, useful-repair rate and attempts per accepted card/set. Do not silently lower the threshold to make runs finish.

### Design limitation — Pilot is a gate, not a shared visual reference

`ProductionRules.pilotAccepted()` gates production; `pilotAttemptId` records the approved selection. Card request construction does not receive that pilot image. Remaining cards share the art contract and two fixed original anchors, plus individually selected references. This is not a broken promise of the current code, but it leaves the set's visual realization independently sampled per card.

Proposed experiment, not a proven fix: attach the exact verified pilot as a subordinate set-consistency reference for the remaining cards. Preserve original references as style authority, keep category-specific composition, and prevent copying the pilot's subject, palette or layout. Reviewer acceptance must remain grounded in originals. Compare with the current approach on the same planned subjects before making this default; a pilot can propagate its own deviations.

### P2 — Offline audit capture depends on the newest user run already having a plan

The committed `scripts/audit-pipeline.ts:169–172` selects the newest run without filtering for a ten-card plan. The audit failed when a newer run was still planning, even though older suitable runs existed. This affects reproducibility of the audit command, not production generation.

For this review only, `capture.ts` is an isolated copy with corrected relative imports, a separate output directory and an explicitly pinned historical run `6025fe06-89dd-448d-b0fe-f3942930ad3a`. It passed. The application script and user runs were not modified. A later tooling fix should accept an explicit fixture/run ID or select the newest valid planned run and record it.

## Current algorithm: what is already worth keeping

1. Producer theme/wishes and source-set context produce a ten-card plan, exact category allocation and shared art contract. Deterministic validation and a separate plan-review call gate image work.
2. Full reference metadata is indexed/cached. Weighted lexical retrieval considers subject, material, silhouette, category and other visual descriptions. A vision task inspects a bounded candidate pool, ranks it and supplies take/ignore guidance.
3. Selection guarantees original anchors, two matching-category originals and bounded supplemental art. Current card prompts include the assigned category, shared art contract, peer roles and one matching category diagram.
4. The pilot passes card verification before other cards start. Cards are generated separately, normalized/cropped to 430×480, and reviewed as delivered. Repairs are bounded.
5. The ten selected cards are composed deterministically. Whole-set verification compares against clean original sheets and checks style, story, diversity, palette, composition and category coverage. Outliers receive targeted corrections and another review.
6. Export binds accepted selections and reviewed sheet identity to actual image bytes. Historical configuration/provenance snapshots remain preserved.

The isolated payload capture again verified 160 source cards, 25 contextual images and 15 clean sheets; 128 eligible references and six primary ordinary sets. All ten packets passed routing checks: eight originals plus one matching diagram, packed into three transport sheets. The planner/selector outputs in this capture are explicit fixtures; no fresh model selection or artistic judgment was tested.

## Addendum — Preparation, cache reuse and waiting time

Integrated the neighboring-chat discussion supplied by Alex in `/Users/alexandr/.codex/attachments/5452a944-92c4-4e2c-9642-5c927efa1095/Pasted text.txt`. Its observations are additional evidence, not instructions to execute generation or modify the application. The relevant current cache, preparation and launch paths were reread for this addendum. No model requests were made here.

### Distinguish migration from routine work

The neighboring audit reports 21 old `sets-v1` observations and 21 new `sets-v3` observations produced during the user's subsequent run, plus compatible analyses for 150 cards entering indexing. These disk counts and its approximately four-minute duration are attributed to that audit, not independently remeasured in this addendum. The 150 indexable records are not the same count as the 128 references eligible after visual-analysis exclusions.

Current code confirms that the persistent source-analysis key includes image content, model, prompt, source rule hashes and active rules. Theme is not part of that key. The migration deliberately prevents unproven reuse of old analyses under new rules; this is a correctness safeguard and must not simply be removed to make startup faster. With matching cached inputs, a new theme should not rerun the full visual source analysis. A theme-dependent selection from cached descriptions remains legitimate work.

Resource preparation and model analysis are distinct. Imported PNGs, manifests and clean contact sheets do not prove that compatible model descriptions exist. Likewise, the visible status “Analyzing the reference library” does not prove that model calls occurred: `ProductionWorkflow.ts:92` emits it before `initialize()` checks the cache.

### P2 — Volatile timestamps cause avoidable card-preparation cache misses

`CodexStylePreparation.prepare()` hashes the entire `profile.knowledgeContext` (`src/infrastructure/style/CodexStylePreparation.ts:253–266`). `CodexSourceContext.prepare()` reconstructs that context with a fresh `createdAt` timestamp (`src/infrastructure/style/CodexSourceContext.ts:292`). Two otherwise identical contexts created at different times therefore produce different preparation keys. This is independently confirmed by reading the current code; it is not an inference from the UI status.

Use a stable, explicitly versioned projection of semantic dependencies rather than serializing the full evidence envelope. Preserve relevant image hashes, effective metadata, ordered reference roles, model/template revisions, active rules, accepted contract, card specification and correction; exclude creation times, durations and display-only fields. Keep timestamps in the saved evidence. A changed correction or genuinely changed context should still invalidate preparation. Removing only `createdAt` is insufficient for durable reuse across application restarts.

### P2 — Run preparation is recorded as evidence but not durably reused

Producer interpretation, source-set selection and per-card preparation are held in in-memory promise maps. `RunService.launch()` creates new preparation/source-context instances on Resume. The evidence already saved with a run or attempt is not loaded as a reusable preparation checkpoint. Consequently, a resumed run can repeat text/vision tasks even while its original-image analysis caches remain valid. This is separate from regenerating image pixels and from the two P1 recovery defects above.

Persist successful preparation results per run/stage with their semantic dependency identity. Validate a checkpoint against the frozen run profile, reference bytes and requested correction before reuse. Do not persist rejected promises or treat unfinished work as successful. Reuse an identical prepared request; explicitly reprepare only the affected stage when its inputs change. For review-only recovery, retain enough reference/evidence provenance to avoid unnecessary fresh selection. Unknown provider outcomes still require the existing conservative handling.

### UX gap — Readiness and fresh model work are not distinguished

Make Knowledge Base preparation a developer/release workflow and an optional Settings resynchronization action, with a read-only readiness check. **Ship a complete validated index: a normal first launch or new project must not perform source-image analysis.** Report source examples and individual-card analysis separately, using current counts and profile/model revisions. Useful states are cached, missing, outdated, preparing and failed, with a concise invalidation reason. Example wording is “Source examples ready: 21/21”, not an unconditional “Analyzing…” when nothing is being recomputed.

Do not silently spend model limits on application startup or after every settings edit. New-project creation reads a compatible published index and never silently falls back to full library analysis. Missing/incompatible preparation is a readiness problem with a separate Settings synchronization path, not hidden work inside generation. A changed theme should require thematic planning/selection, not invalidate stable source descriptions. Even with a fully ready library, per-card visual selection, image generation and verification remain real work; do not promise instant sets. User-authorized imports/updates may schedule the incremental background preparation mechanism; simply using an unchanged library does not.

### Conditional optimization — Separate observations from rule-dependent assessment

The current source-analysis prompt receives active rules, so its output cannot safely be relabeled as rule-independent cached observations. A future two-stage design could store intrinsic visual observations keyed by image/model/extraction prompt, then derive category/eligibility and transferable guidance under the current rules. Consider that split only if measured rule-edit frequency and repeated analysis cost justify it. Version/migrate explicitly, retain evidence, and invalidate the dependent assessment when categories change. Never reuse an old category judgment solely because the image bytes are unchanged.

The producer interpretation and source selection performed after planning may overlap with earlier work, but the final concept can legitimately change the relevant references. Instrument call purpose, cache hit/miss reason, elapsed time and reported usage before merging calls. Reuse compatible planning outputs where demonstrably equivalent; do not remove the independent plan/card/set quality checks to reduce call count.

### Added acceptance scenarios

- A second theme under the same prepared library/model/rules causes zero fresh source-image analysis requests, while theme-specific planning and selection are allowed.
- Identical semantic context with different evidence timestamps reuses preparation; changing the card correction, relevant source hash or active category definition does not reuse an incompatible result.
- Pause/resume and application restart reuse completed preparation checkpoints without repeating completed selector/art-direction tasks for unchanged dependencies.
- Readiness checks perform no model calls. Explicit preparation processes only missing/incompatible entries and accurately reports cache hits, new work and failure.
- Historical runs continue using their frozen configuration; a library edit does not reinterpret their checkpoints.
- Call-reduction work is evaluated alongside style/retrieval quality. Fewer requests alone is not evidence of a better production algorithm.

## Addendum — Whole-set composition and the new cinema result

### Confirmed artistic/control gap

Inspected all 15 local clean sheets and the saved result for run `9321e731-b2fe-42bf-a287-d44239a3be02`, variant `2e7459ff-68c4-49fa-aa58-2c57a5b0f4be`, **Opening Night at the Cozy Cinema**, corresponding to the user's screenshot. The run is paused and its final set review is **failed**. Individual green card checks do not establish whole-set acceptance.

The accepted plan assigns categories `3/3/2/2` and explicitly constrains the palette to recurring burgundy, teal and cream, with apricot/plum/mint backgrounds. Its composition prose places three floating subjects first, three minimally supported objects next, two material-surface vignettes next, and two auditorium scenes last. This allocation is a choice of this plan, not a universal hardcoded category ratio. The generated result substantially follows it: three graphic backgrounds, three simple color fields, two material supports against simple walls, then two contextual rooms. Improving execution of this same plan alone will not fix its restricted visual rhythm.

The set reviewer rated palette balance `4.5`, composition balance `4`, and thematic cohesion `5`. It rejected fine texture on the loudspeaker/projector and tight margins on the screen. It did **not** explicitly diagnose insufficient backdrop variety or the overly narrow dominant palette. Thus a functioning rejection gate is present, but its diagnosis does not cover the user's central concern.

### Visual inventory and limits

`clean-set-background-survey.json` records manual observations for every ordinary card, source IDs/hashes, slots, exclusions, counts and borderline cases. These are provisional diagnostic labels, **not** authoritative composition-category changes or newly installed runtime policy. No library entry or cache was changed. Four exclusive dominant-presentation bins simplify overlapping attributes; production needs the orthogonal attributes described below.

| Clean sheet          | Ordinary cards | Decorative pattern | Simple color field | Material surface | Recognizable context |
| -------------------- | -------------: | -----------------: | -----------------: | ---------------: | -------------------: |
| Gardens              |             10 |                  4 |                  0 |                0 |                    6 |
| Sports               |             10 |                  3 |                  1 |                4 |                    2 |
| Finals               |             10 |                  4 |                  1 |                1 |                    4 |
| Amusement            |             10 |                  4 |                  2 |                1 |                    3 |
| Coolness             |             10 |                  5 |                  1 |                2 |                    2 |
| Countrystead         |             10 |                  3 |                  2 |                0 |                    5 |
| Seafaring            |              9 |                  4 |                  0 |                2 |                    3 |
| Boyscoute            |              9 |                  5 |                  1 |                1 |                    2 |
| Vacation             |              8 |                  5 |                  0 |                1 |                    2 |
| Beach                |              8 |                  3 |                  0 |                1 |                    4 |
| MusicFest            |              8 |                  3 |                  1 |                0 |                    4 |
| Diving               |              8 |                  3 |                  2 |                1 |                    2 |
| RoadTrip             |              7 |                  3 |                  0 |                0 |                    4 |
| Poolside             |              7 |                  5 |                  0 |                1 |                    1 |
| Tour                 |              6 |                  3 |                  0 |                0 |                    3 |
| **Generated cinema** |         **10** |              **3** |              **3** |            **2** |                **2** |

Across the six primary sheets (60 ordinary cards), approximate mean counts per ten are **3.8 pattern, 1.2 simple field, 1.3 material surface, 3.7 recognizable context**. Across all 130 ordinary cards, pooled proportions normalized to ten are **4.4 / 0.8 / 1.2 / 3.6**. The latter is a pooled-card statistic, not the mean of 15 complete ten-card ordinary sets: mixed sets contain 20 excluded gold/character slots. Gold scenes must not inflate ordinary-card context targets, and ordinary cards must still pass active content eligibility rules independently.

These numbers depend on a stated visual judgment. A curtain/stage or cloud sky counts as partial context; a close-up court/wood surface without a developed setting counts as surface-led. A few examples are ambiguous, documented individually. Do not turn these approximate averages into mandatory quotas. Source variation is real: Gardens is context-heavy, Poolside is pattern-heavy. Select a relevant set profile and allowable ranges for the theme, retaining the broader library as a style boundary.

The more significant difference is **combinations and rhythm**:

- Patterns are not confined to floating category 1. Gardens' fountain combines stone paving and stripes; Countrystead's mower combines grass and rings; Poolside's slide combines pool tiles and waves. Grounded categories can retain lively decorative backdrops without becoming full scenes.
- The cinema's five middle cards mostly repeat plain rear planes, while the source sheets alternate supported objects, patterns and environments more freely. Separately consider presentation order; do not automatically sort the final sheet by category.
- The source palette spans more independent dominant hues. Shared rendering does not require repainting most objects teal/burgundy or repeating the same cream/orange support. Preserve material logic and coherent lighting while allowing wider card-level color roles.
- Adding scenery everywhere is not the solution: source style also depends on restraint, clear silhouettes, simplified materials and readable hierarchy. Keep background richness and visual noise as separate measurements.

### Missing contracts and feedback

`src/shared/KnowledgeContracts.ts`, `KnowledgeContracts.analysis`, stores summaries and lists of visual/semantic principles, not per-slot observations or distributions. `CodexSourceContext.index()` analyzes original contextual screenshots; clean sheets are used downstream for comparison, but have no structured composition-statistics extraction stage.

`src/shared/SetContract.ts`, `SetContract.art`, stores `paletteRhythm` and `compositionRhythm` as prose. Per-card `visual` stores materials, silhouette, palette role and composition strings. There are no independently validated background allocations, variation bounds or observed traits. `PromptBuilder.build()` supplies peers' intended subjects/categories/roles, not what the selected generated images actually contain. The production workers operate independently after the pilot gate. Final-review scores are broad judgments rather than measured deviation from a source-grounded distribution.

### Additional confirmed defect — Planning image numbers leak into generation

The cinema art contract's `rendering` text refers to planning images 1–11, including images 8/9/10/11 as category examples 1/2/3/4. That exact phrase appears in the saved first card's generation prompt. `PromptBuilder.build()` serializes the contract unchanged while `GenerationRequestBuilder` creates a different, card-specific input manifest. These planning-only positions are therefore unsafe persistent identifiers and can conflict with the actual attachments.

Keep persistent art contracts reference-position-independent: store stable reference IDs/roles and visible artistic requirements. Bind any image numbers only when rendering each stage's real attachment manifest. Validate the complete prompt packet for stale positional references. Historical evidence must remain untouched. This is a concrete prompt-integrity defect; it does not prove the amount of visual damage caused in this particular run.

### Target design — A bounded set-composition executor

Add one cohesive application use case, provisionally `SetCompositionDirector`, reusing existing model ports and persistence. This is not a request for a new autonomous-agent framework or a different model per task. Domain rules do counting, consistency and feasibility deterministically; a vision task supplies observations. Reuse existing card review to extract observations where practical rather than adding an unconditional extra model call after every image.

1. **Prepare source profiles once.** Inspect all clean sheets and all slots, linked back to original card IDs. Extract independent fields: composition category; backdrop treatment (plain/gradient, rays, rings, stripes, waves/checks, repeated non-text motif, natural/architectural); support/material; depth; context density; camera/subject scale; dominant color role; rendering/material treatment. Include confidence and evidence. Pattern, support and depth can coexist. Validate samples manually. Cache observations under content/model/extractor revisions; evaluate categories/eligibility under the active rules. Catalog gold/character scenes as category 5; exclude them only when calculating ordinary-card distributions or preparing an ordinary-only run, never by deleting them from knowledge.
2. **Freeze a feasible ten-slot plan.** Select theme-relevant source profiles and record why. Set permissible ranges and concrete slot assignments, then validate all ten jointly with category coverage. Store palette, depth, patterned/quiet/scene balance and display order, not only prose. The independent plan reviewer must compare the proposal against the source profile, not only against its own internally consistent concept. Do not replace theme judgment with a universal global average.
3. **Track planned versus observed state.** Persist the exact contract revision, selected accepted attempt IDs/hashes, observed traits and pending/reserved slots. Derive counters from selected verified versions; do not increment mutable counters for every attempt. A retry replaces its slot, a failed/unknown candidate stays unaccepted, and selecting an older attempt recomputes state. Unknown visual traits remain unknown rather than being copied from the requested plan.
4. **Guide each next request.** Supply its assigned slot, relevant category/trait-matched source references, shared rendering requirements, and the deficits relevant to that slot. Let the director inspect an appropriately sized current-set contact sheet plus actual observations when resolving visual drift. Do not append every prior full-resolution image or all source analyses to every generator prompt. A bounded selection of sibling visual references can help consistency, but originals remain the style authority and pilot conditioning remains an experiment.
5. **Verify actual realization.** Card review reports what is visibly present, then deterministic rules compare that with the slot and current set. A planned pattern rendered as a plain gradient does not fulfill the pattern allocation. Correct the affected card, or explicitly review a revised plan for ungenerated slots; never silently loosen targets to make a failed image fit. If a change affects approved cards or makes the remaining plan infeasible, stop for a bounded plan decision instead of cascading uncontrolled retries.
6. **Preserve concurrency safely.** Two workers may continue when their distinct slot requirements are fixed and reserved. Any adaptive assignment/replan must be serialized against a composition revision; stale completions must be reevaluated against the current contract. Pause/restart reconstructs the same accepted state and resolves abandoned reservations. Explicit sequential generation is an option for an experiment, not an assumed architectural requirement.
7. **Check the complete visual set.** Compare the actual ten-card sheet with eligible clean references, the frozen target profile and observed distribution. Assess palette range, adjacent clusters, repeated camera/scale, background/context balance and rendering drift together. Record concrete mismatches and minimal card/ordering changes. Reordering requires a fresh sheet review but no image regeneration. Approval must bind to the exact selected attempts, order, contract and sheet hash.

### Acceptance scenarios for the addition

- All 15 sheets are covered, source lineage is retained, gold/character slots excluded from ordinary statistics; source profile reuse does not depend on the producer theme.
- A patterned background on a supported object is represented without changing its composition category merely because it has a pattern.
- The current cinema becomes a labeled whole-set regression case: a valid 3/3/2/2 category allocation cannot by itself prove source-like composition, and a narrow consistent palette must not automatically receive excellent source-fidelity judgment.
- A model claiming the requested background is present must support that claim with visual evidence; uncertain observations do not silently satisfy targets. Human labels calibrate this observer too.
- Rejected attempts, retries, manual selection, pause/restart, out-of-order completion and two concurrent jobs cannot double-count or lose a slot. Plan edits invalidate incompatible observations/preparations/approvals through explicit dependency identities.
- No persisted contract contains attachment positions from another stage. Prompt captures bind every image role to the current packet.
- Plan/ordering/counter tests can run offline. Actual observer accuracy and improvement in generated art require a separately scoped model evaluation; none was run for this audit.

## Addendum — Complete catalog preparation, category evidence and delivery contract

This section incorporates Alex's subsequent instructions: two explicit analyzers, all source kinds cataloged, visual category evidence, optional gold cards, Russian canonical rules and a preprepared index shipped with the application. These are implementation requirements; the tools and runtime changes described below have **not** been implemented or executed during this audit.

### Scope of the source catalog

Catalog all 160 original individual images, all five category sheets, original collection screenshots with UI, derived clean sheets, source rule documents and delivery/UI templates. Keep stable IDs, hashes and explicit relations: original screenshot -> set -> ordered slot -> individual image; category sheet -> example crop -> category; derived clean sheet -> source set/slot membership. Do not conflate the 130 ordinary slots surveyed in 15 clean sheets with all 160 individual source assets. Inventory any remaining source sets and missing relations, including the grand-set material, before declaring preparation complete.

Preserve originals byte-for-byte. Generate reproducible analysis crops/contact sheets with recorded crop bounds, source hash and processing revision. Use clean art for visual statistics, original UI screenshots for membership/order/provenance, and delivery templates for presentation geometry. UI borders, titles and stars must not pollute rendering tags or be copied into image-generation references. Detect duplicate artwork by content identity so repeated occurrences do not overweight pooled statistics or trigger duplicate extraction. Retain set membership: one card can participate in more than one contextual observation.

### Exact category semantics and authoritative exceptions

Reread `Art Sources/Общие правила/Описание.txt` and visually inspected every sheet in `resources/knowledge/images/categories/1` through `/5`. Preserve the source Russian text as the canonical rule body; the following English table documents the implementation mapping, not a replacement translation to inject into prompts.

| Category | Required relationship                                                                              | Allowed background treatment                                                             | Classification evidence                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Simple object floating without support/contact                                                     | Single-color/gradient or simple pattern: stripes, repeated motifs, rays, etc.            | Rule text plus category-1 examples; no support introduced merely because the background has a pattern.                                          |
| 2        | Simple object standing on a simple supporting surface, with a simple vertical backdrop             | Plain/single-color, gradient **or pattern**                                              | Supported-object examples, e.g. cup, drink, bag; distinguish support from the rear plane.                                                       |
| 3        | Object supported by/integrated with a recognizable realistic material surface, with spatial volume | Rear vertical backdrop may also be plain/single-color, gradient **or pattern**           | Tablecloth, wood, tile and comparable material/depth evidence. Pattern does not imply category 1 or 2.                                          |
| 4        | Main object integrated in recognizable surrounding environment while remaining central             | A coherent natural/architectural environment; complexity stays subordinate to the object | Include minimal contextual examples: a football on a marked field is explicitly shown here. Do not impose an arbitrary minimum number of props. |
| 5        | One or two characters acting out a simple narrative in category-4-like surroundings                | Contextual scene supporting the characters and action                                    | Category-5 sheet plus narrative, character count and visual role; retain independently from ordinary-card eligibility.                          |

Source category illustrations sometimes have misleading captions: the category-2 citrus tree is labeled “Risotto”, and sunscreen/glasses are labeled “Lifeguard Tower”. Treat those as presentation metadata, not semantic ground truth. Text rules and correctly assigned visual exemplars are complementary; do not invent labels from OCR captions.

**User-authoritative exception:** gold UI frames are reserved exclusively for category 5. The gold-framed rollercoaster in category-4 sheet slot 5 is an erroneous source example, not a precedent allowing gold frames on category 4. Record a persistent source exception keyed by source hash and slot. Exclude that conflicting framed example from authoritative category classification until corrected; retain the original and the issue. Do not teach a characterless coaster to be a category-5 narrative just to reconcile a mistaken frame. Cropped art may remain useful for rendering if its role is explicitly restricted. Gold-colored object materials are not gold rarity, and generated standalone art still contains no UI frames.

Keep `compositionCategory`, `support`, `backdrop`, `depth`, `contextDensity`, `subjectShape`, `materials`, `camera`, `palette`, `rendering`, `narrative/characterCount` and source UI/rareness observations separate. Use controlled facet values with stable machine IDs and documented meanings, not unconstrained synonym lists. Text descriptions complement these fields. Track observation evidence, confidence, competing category judgments and manual overrides. A conflict must be surfaced, not hidden behind a forced confident label. The earlier survey's “material-surface” bin is not a category-3 label: it was a provisional visual presentation bin, and the category-4 field-ball example demonstrates why that distinction matters.

### Slot-specific reference retrieval contract

The same controlled visual facets must be used by source cataloging, the accepted ten-slot plan, retrieval and generated-card observation. A tag is not merely a UI label: it participates in the selection contract. Separate shared rendering style from composition variations within that style (pattern, support, depth, camera, etc.).

For each slot, persist required versus preferred facets. Example: category `3`, realistic material support, patterned rear backdrop; if the approved plan specifically calls for stripes, that pattern subtype is also required. Filter eligible **composition references** on these required facets first, then rank the matches by subject, material, silhouette and other preferred similarities. A thematically similar category-3 image with a plain backdrop cannot replace a patterned composition exemplar merely because its overall similarity score is high. Inspect the shortlisted actual images visually to confirm the fit and tag confidence before binding them to a generation request.

Shared-rendering or material-only references may differ in background only with an explicit restricted role and take/ignore guidance; they do not satisfy the required composition-reference slots. Never present contradictory references as interchangeable examples. Prefer several complementary matching examples when available, rather than a fixed one-image limit or indiscriminately maximizing image count. If there are no reliable matches for the required combination, record a coverage gap: obtain/curate appropriate evidence or explicitly revise and revalidate the ungenerated slot/set plan. Do not silently relax hard facets, invent matching tags, or claim a mismatch is exact evidence. Detect gaps during planning where possible, before image generation.

The request is bound to the accepted slot revision and a snapshot of the set's selected verified attempts/observed facets. Prior actual results can trigger a reviewed adjustment of remaining slots but must not quietly rewrite approved targets. After generation, compare observed category/support/background with the same requirements used for retrieval, then update the derived accepted-state distribution. Multiple sets in one project have independent ten-slot state; accepted images from another variant cannot satisfy this set's remaining allocations.

Acceptance fixture: a query for category 3 + realistic support + patterned backdrop excludes a semantically closer plain-backdrop card from composition references, returns visually validated matching originals when present, reports an explicit gap when absent, and records the exact chosen reference IDs/roles and slot revision. A generated plain backdrop fails that slot even if the image otherwise looks attractive.

### Two analyzer entry points over shared application services

The following are proposed command names, not commands currently available:

- `kb:analyze-cards`: prepare the five category exemplar profiles, then analyze **every** individual source card against the canonical text **and actual category exemplar images**. Select a likely category, visually compare nearest alternatives for ambiguous cases, and persist typed visual facets, category rationale, exemplar IDs and uncertainty. Include category 5 even when the default production profile forbids generating it. Do not prefilter catalog input using production eligibility.
- `kb:analyze-sets`: inspect complete clean layouts and their original UI set membership, reuse card observations by ID/hash, and extract whole-set profiles: category/visual-facet distributions, coexistence of patterns and support, color rhythm, adjacent runs, scale/camera variation and semantic roles. Persist complete-set statistics and separate ordinary/gold-conditioned summaries. Do not merely count isolated-card tags: the whole-sheet visual comparison is necessary.
- `kb:sync`: coordinate inventory/diff -> category exemplars -> card catalog -> set profiles -> validation -> publication. Independent raw observations can be reused, but publish only after cross-relations and dependent aggregates agree. Both CLI and Settings call these same application services; do not implement duplicate pipelines or make Electron spawn a development-only npm command.

Existing `prepare:library`, `prepare:knowledge` and `prepare:clean-sets` perform asset preparation/import; they do not establish complete semantic cataloging. Existing `CodexStylePreparation.analyzeBatch()` attaches the card batch with textual category definitions but no category-sheet exemplar images. Its analysis has descriptive fields, not the proposed normalized facets and explicit exemplar evidence. Existing item/category metadata excludes category 5 while the analysis schema can represent it. These are concrete gaps to address rather than presenting the new proposal as already implemented.

### Developer preparation and incremental publication

1. The developer runs initial complete preparation before shipping. Run the actual analyzers, inspect low-confidence/conflicting records, apply explicit reviewed corrections, validate all expected source assets/relationships, and publish a revisioned ready bundle. Handwritten audit observations are evidence for validation, not a substitute for this step.
2. Ship the validated catalog and derived profiles with the app; do not rely on a private developer cache under Application Support. Include schema/taxonomy/rule/extractor revisions, source hashes, completeness status and a root manifest/checksum. Packaging/release checks fail for a missing or incompatible bundle. First-launch validation is local and makes no model requests.
3. New-project creation freezes the current published catalog revision and uses its read-only index. It performs **zero library cataloging calls**, including on a fresh installation. Theme-specific retrieval, planning and generation remain separate work. An unchanged source library requires no reanalysis.
4. Settings exposes **Resynchronize knowledge base**, progress, changed/missing/conflicting counts and cancellation. Default to changed entries; allow an explicit full rebuild as a secondary maintenance action. Developer source updates and user-authorized imports can run this mechanism in the background; do not silently run expensive full analysis on startup or every project.
5. Dependency invalidation is precise: changed card bytes invalidate that card and affected set profiles; changed category exemplars/rules invalidate dependent classification; changed set membership invalidates affected set statistics; theme/UI language/evidence timestamps do not invalidate visual observations. Reconcile manual edits as a separate authoritative layer; never overwrite them with a reanalysis. Persist pending work and resume completed stages.
6. Build a candidate revision beside the published version, validate, then atomically switch its manifest pointer. Serialize publication against concurrent syncs/imports. Failure/cancellation leaves the previous ready version usable; deletions become explicit inventory changes, not immediate source destruction. Active runs stay pinned to their prior snapshot. Newly imported incomplete items stay out of ready retrieval until their revision is published.

Completion means every source record is either successfully analyzed or has an explicit reviewed disposition/exception. It does not mean silently ignoring gold, ambiguous images, broken references or unsupported assets to obtain a green count.

### Gold-card checkbox and policy scope

The original assignment explicitly requests cinema-genre deliverables **without gold cards** (`Art Sources/Тестовое задание/Описание.txt:25`). Excluding gold from those deliverables and from ordinary-only comparison statistics was justified. Excluding it from the overall knowledge catalog is not. Preserve and classify all category-5 examples and make production eligibility a per-run policy.

Add one checkbox in the new-set form: EN **Include gold cards**, RU **Добавлять золотые карточки**. Default unchecked. Unchecked means exactly ten ordinary cards with categories 1–4 represented. Checked means a ten-card mixed set including category 5 while retaining all four ordinary categories. The planner chooses a source-grounded gold allocation; no extra count field is needed. With ten total slots and four required ordinary categories, at most six slots can be gold, but reference-driven distributions should be much narrower where the sources support that. Checked must actually include at least one gold card, not merely change wording while generating ten ordinary cards.

The flag describes narrative card content, not an instruction to paint a decorative gold border into standalone artwork. Generated deliverables remain illustrations without UI chrome. All-gold grand-set generation is a distinct source type to catalog; it is not enabled by this simple mixed-set checkbox and must not bypass ordinary-category coverage accidentally.

Implement the flag end-to-end: `BriefForm`/`BriefViewModel`, shared brief/IPC schemas, frozen run state, category-5 plan/card/art-contract schemas, category-aware source retrieval, prompts, observation/verification, set composition and export gates. Default legacy briefs to false under their original version semantics. Replace unconditional no-people/no-gold prompt rules with scoped ordinary-card restrictions; category 5 receives its own 1–2-character narrative requirements. Do not pass contradictory ordinary and gold rules together. Existing `SetRules.validatePlan()` requires exactly four categories, and `hasCleanSetEvidence()` requires primary ordinary sheets; both need mode-aware validation. A UI-only checkbox would not work.

### Canonical language decision superseding English-only rules

Alex now requests Russian canonical rule bodies taken from Miro unless OpenAI requires English. Searched and opened the official [image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting) and [image-model prompting cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide). Neither checked guide states an English-language requirement or establishes that English is necessary for image quality. Their English examples are not such a requirement. This is a finding about the checked relevant documentation, not proof of absence from every OpenAI page or proof of identical quality in all languages.

Accordingly, the new target is **one Russian canonical rule source**, initialized from the exact substantive Miro text. Remove export boilerplate; retain provenance separately. Preserve source wording for categories and collection rules. Authored operational additions, observed visual guidance and user corrections must remain explicitly distinguished from source quotations and written in Russian, not passed off as original Miro text. The frame exception above is a user-authored correction. UI EN/RU localization stays independent and never translates stored rule bodies on language switching; machine IDs/schema keys may remain English.

Plan a versioned migration of the current English working rules, not a destructive reset. Preserve existing edited rules, historical run snapshots and change history; map source-backed defaults to original Russian text and surface conflicts for reconciliation. Update repository `AGENTS.md` and relevant application documentation to replace the older English-only requirement during implementation. Remove any English-only validation/prompt instruction affecting canonical rule content. Models receive the selected Russian rule bodies directly, without maintaining or regenerating a second English authority. Applicability remains stage/category-specific. Rule-dependent cache invalidation must reflect the new canonical revision; do not promise reuse of incompatible old analyses.

### Additional release/acceptance checks

- Clean install with shipped resources and no developer cache can create a project without any source cataloging calls; completeness and corruption checks are local.
- All source types and 160 individual assets are accounted for, including category 5; missing set/crop relations and low-confidence cases are visible.
- A category-2 patterned supported object and a category-3 patterned realistic-surface object classify correctly against visual exemplars; category-4 field ball is not reclassified solely by an oversimplified background bin.
- Category-4 gold-frame source exception remains effective across rebuilds; misleading captions do not become subject labels; only category 5 is allowed gold UI framing.
- A one-card update processes only its affected dependency closure; a second unchanged sync performs zero model calls. Cancellation/publish failure retains the last valid catalog. Active runs remain pinned.
- UI language switches do not change Russian rule bodies or cache identity; original Miro clauses and user amendments retain their separate provenance. Legacy runs remain reproducible.
- Checkbox off/on produces valid ordinary/mixed plans, never eleven cards, never contradictory prompts. Exact-version review and export work for both modes. Use offline fixtures first; artistic quality still needs scoped visual evaluation.

## Research and its actual implications

- [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting) supports numbered reference roles, concrete visible properties and revision inputs with explicit preservation constraints. The current pipeline substantially follows this; the resume defect interrupts that intended revision behavior.
- [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) calls for task-specific evaluations and human feedback to calibrate automated judgments. This supports prioritizing a labeled artistic benchmark over adding another uncalibrated model reviewer.
- [OpenAI image-generation limitations](https://developers.openai.com/api/docs/guides/image-generation) acknowledge remaining consistency and precise composition limitations. Prompting and retries are controls, not a style guarantee.
- Inspected [Diffusers IP-Adapter implementation](https://github.com/huggingface/diffusers/blob/main/src/diffusers/loaders/ip_adapter.py), especially `set_ip_adapter_scale`, and [official documentation](https://huggingface.co/docs/diffusers/main/en/using-diffusers/ip_adapter). They offer image conditioning with layer-specific style/layout influence. These controls belong to those diffusion pipelines; they are not parameters this app can simply add to a Codex image call.
- Inspected [StyleAligned's SharedAttentionProcessor](https://github.com/google/style-aligned/blob/main/sa_handler.py), which shares first-image attention features and uses adaptive normalization. This is a concrete model-level mechanism for shared style, rather than an agent naming convention. It requires a different backend. It supports investigating visual consistency conditioning, but does not establish that passing a pilot to the current backend will yield equivalent results.

## Focused implementation plan — not executed

| Order | Scope                                                                                                                                                                                                                                                     | Acceptance evidence                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Establish canonical Russian Miro rule bodies, structured category/facet definitions and explicit source exceptions; design the versioned migration preserving user edits and historical snapshots.                                                        | Categories 2/3 both permit patterns with their distinct support requirements; category 5 remains cataloged; gold-frame exception is recorded; no duplicate translated rule authority.                                                                                           |
| 1     | Repair the two recovery defects. Centralize next-action decisions and separate content rejection from transport failure; avoid a wholesale workflow rewrite.                                                                                              | Pause/budget/resume retains correction and previous candidate; transient plan-review failure reuses the proposal; image and repair limits remain bounded.                                                                                                                       |
| 2     | Canonicalize effective reference metadata for every stage; review disputed anchor labels. Make audit fixtures explicit.                                                                                                                                   | Edited category/description reaches planning, retrieval, generation manifests and review consistently; historical snapshots unchanged; capture works with a newer unplanned run present.                                                                                        |
| 3     | Remove planning-only image numbers from persistent art contracts; bind roles through each actual stage manifest. Add structured source composition profiles and independently reviewed ten-slot targets, using the visual survey as provisional evidence. | No cross-stage positional conflicts; all ordinary source slots covered with lineage and uncertainty; supported patterned backgrounds represented; theme-appropriate visual diversity is checked before image calls.                                                             |
| 4     | Define stable semantic preparation keys, remove timestamp sensitivity, and persist successful run preparation checkpoints. Keep provenance separate from cache identity.                                                                                  | Identical context reuses preparation across pause/restart; relevant input changes invalidate only incompatible results; failed tasks are not cached as successes. Include new composition-contract dependencies.                                                                |
| 5     | Add the bounded set-composition executor and observed-trait feedback; extend whole-set review and exact-version approval.                                                                                                                                 | Selected accepted versions determine counts; retries/resume/concurrent completion preserve slot identity; actual backdrop/palette/order deviations yield targeted corrections. No universal fixed ratios or unconditional extra observer call.                                  |
| 6     | Implement the two analyzer entry points/shared sync service, perform developer preparation, ship its validated complete catalog, and expose incremental background resync in Settings.                                                                    | Fresh installation and new projects make zero library-analysis calls; all source kinds and category 5 accounted for; incremental invalidation, manual edits, cancellation and atomic publication verified.                                                                      |
| 6a    | Add the single Include gold cards checkbox with complete ordinary/mixed policy propagation through planning, retrieval, generation, verification and export.                                                                                              | Default off matches the cinema assignment. On creates a ten-card mixed set with category 5 and categories 1–4, no drawn UI frames or contradictory rules; historical ordinary runs remain valid.                                                                                |
| 7     | Build a small representative human-labeled style, whole-set composition and retrieval benchmark from existing art/results. Version the rubric and held-out cases.                                                                                         | Explicit disagreement report, false-accept/false-reject measurements and reference relevance; include this cinema set and good-looking but source-incompatible sets. This needs no new art; future model re-evaluation consumes text/vision calls and requires an agreed scope. |
| 8     | Only after that, compare current generation with verified-pilot conditioning. Keep reference count/packing as a separate experiment rather than changing everything together.                                                                             | Better human-rated source-style fidelity and set coherence without subject/composition copying; no unacceptable increase in retries or cost. Requires separately authorized real generations.                                                                                   |
| 9     | Use the best measured configuration to produce the actual final assignment deliverables.                                                                                                                                                                  | Three distinct cinema-genre sets, all ten cards/four categories each, visual comparison and work log on Miro, repository link. Support for 3–5 requested variants is demonstrated while daily default remains one.                                                              |

Benchmark annotation can proceed alongside deterministic recovery/cache work. Splitting intrinsic observations from rule-dependent assessment, merging model tasks, changing retrieval weights and changing reference counts remain conditional follow-ups: implement them only against measured cost or quality deficiencies. The one-time `sets-v3` migration is not itself a defect to roll back.

Do not add a vector database for a 160-card library without measured retrieval misses. Synonym/embedding retrieval is a conditional improvement if a labeled reference-selection benchmark shows lexical recall problems. Do not increase references or prompt length merely because the provider accepts them. Native processing of packed inputs remains an empirical transport/fidelity question. Do not migrate to LoRA/diffusion or introduce more agents unless controlled comparisons establish a gain that justifies their operating cost.

Secondary items to track, not blockers for the proposed first steps: a whole-set semantic failure currently triggers image corrections rather than automatic subject replanning; record such a failure clearly before expanding autonomous replanning scope. Codex's recorded image model label is assigned by the app, so requested versus verified backend identity should be distinguished in future reproducibility reports. The API adapter's square canvas and center crop should remain an explicit choice subject to silhouette evaluations, not an assumed guarantee.

## Verification performed in this review

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 114 tests in 18 files passed.
- `npm run build`: passed.
- Two targeted offline failure reproductions: confirmed, with no provider calls.
- Stock capture command: failed for the newest-unplanned-run fixture issue documented above.
- Isolated capture pinned to the historical ten-card plan: passed all ten packets. See `packets/report.json` for its unique artifact directory.
- Git commit/push succeeded; the audited application source remains at that commit.
- Preparation/cache addendum: reread the attached neighboring audit and verified timestamp-sensitive keys, in-memory run caches, new instances on Resume, and unconditional analysis status against current source. No additional test suite, model calls or generation was run for this documentation-only update. Neighboring-chat cache counts and timings are explicitly attributed above.
- Whole-set addendum: visually inspected all 15 clean sheets, manually annotated 130 ordinary slots (20 gold/character slots excluded), inspected the cinema run's actual contract/review and confirmed stale planning-number text in its saved generation prompt. These observations changed audit artifacts only; no application tests were rerun and no provider calls were made.
- Catalog/delivery addendum: reread original assignment/category/collection text, inspected all five category sheets, verified existing analysis attachments and schema/validation limitations, and checked the two official image-prompting guides. Incorporated user corrections, gold checkbox, Russian rules and prepackaged catalog requirements into the plan only. No new analyzer, UI checkbox, rule migration or runtime synchronization was implemented in this audit turn.

This review establishes specific control-flow defects and remaining evidence gaps. It does not certify fresh artwork or claim that any untested enhancement will improve style fidelity.

## Implementation update — editable knowledge workspace

The historical audit and its initial plan above are retained as evidence of the original findings. Current implementation now includes the recovery fixes, frozen effective reference metadata, durable preparation caches, validated ten-slot composition contracts with observed feedback, explicit catalog synchronization, and packaged catalog data. Delivery renders all four original UI templates from exact approved attempts, while diagnostics are optional. The gold checkbox and ordinary/mixed production gates are implemented; new artwork quality remains unmeasured because this work does not generate images.

The latest UI change separates Cards, Sets, and Categories, adds image-only browsing and abstract pattern filters, per-entity analysis/editing/removal/import, aggregate whole-set ranges, and explicit per-entity/section reanalysis. Canonical source assets and historical runs remain immutable. General rule editing is in Settings. A cached visual geometry/placement/color pass corrects incomplete older pattern observations before publication. Existing whole-set analyses are refreshed when member observations change.

Items 7–9 (human-labeled benchmark, controlled image-generation experiments, final assignment art) remain outside this no-new-generation implementation. Passing deterministic checks does not establish perfect stylistic fidelity or production certification.

## Source-prototype planner implementation (2026-11-13)

Implemented the approved separation between semantic model work and deterministic composition selection. The model proposes subjects with category compatibility; code selects a feasible joint layout from actual source sets, assigns subjects, freezes required facets and compiles the canonical rendering contract. A second bounded model task fills descriptions only; independent plan/card/set review remains mandatory. Draft checkpoints preserve assignments across transport failures, and final clean-set comparison pins the chosen source prototype. Category-5 textual evidence now follows the applicable card category rather than being unconditionally removed.

See `DETERMINISTIC_COMPOSITION_PLANNING.md` for behavior, configuration, compatibility and limits. No new images or source-catalog analyses were generated for this implementation. Neural adaptation and claims of measured style improvement remain out of scope until a controlled visual evaluation demonstrates a need.
