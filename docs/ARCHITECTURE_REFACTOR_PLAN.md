# Application architecture and set-production implementation

Scope: apply general Clean Architecture rules and MVVM to Collection Studio; no game-engine conventions. Preserve historical runs, originals, EN/RU UI and one-set default. No real generation during implementation.

1. Establish project AGENTS.md and reusable application-architecture skill.
2. Externalize all production prompts into validated JSON templates; reuse shared provider-neutral task builders. Record configuration identity and preserve source provenance.
3. Introduce a versioned set contract: theme/story, category allocation, common rendering/light/material/palette/composition rules, per-card visual requirements, pilot choice and rationale.
4. Add an independent plan-review port and bounded plan revisions before any image call. Persist plan/review evidence; deterministic validation checks category counts, subjects and pilot choice.
5. Use one effective reference index (analyzed categories take precedence). Build candidates by roles: original style anchors, matching category and subject/material/form relevance; require category coverage in the final selection. Visual reranking inspects actual images. Corrections participate in retrieval/cache identity.
6. Gate each set on a verified pilot, then produce remaining cards. Persist exact pilot attempt approval; enforce gates on resume/retry/export. Preserve legacy protocols without automatically running them.
7. Separate orchestration responsibilities through application services/ports and extract React screen logic into injected ViewModels. Keep main as composition/IPC boundary and views declarative.
8. Add architecture dependency checks, focused contract/retrieval/pilot/resume tests, configuration tests and ViewModel lifecycle checks. Run typecheck/lint/tests/build and verify packaged configuration.

Acceptance: default one set/ten cards; no image generation before accepted plan; no non-pilot generation after failed/unknown pilot; category-specific references use effective analysis; edits invalidate stale approvals; failed gates cannot export; all prompt prose lives in configuration; historical data remains readable.

## Implemented

All eight implementation stages are present. See APPLICATION_ARCHITECTURE.md for boundaries, configuration paths, protocol semantics and cache compatibility. Verification includes offline orchestration, dependency and ViewModel lifecycle tests; live artistic acceptance remains a separate task. Source corpus and all historical user runs were preserved.
