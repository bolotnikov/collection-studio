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
