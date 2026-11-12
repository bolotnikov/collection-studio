# Style-first production implementation plan

## Acceptance target

A producer enters a set theme and art direction. The system produces three distinct ten-card candidates in the supplied game style. All four composition categories are required; gold/character cards are excluded. Retrieval and generation must retain original Miro style anchors. Generated images become supplemental references only after an explicit user approval and a passed card review. Passing a model review is not proof of exact style equivalence.

## Implementation sequence

1. Inspect public implementation evidence (Scenario published workflow/UI, IP-Adapter source). Record concrete findings and proprietary-code limits.
2. Introduce validated, versioned production policy: artistic rules, reference count, style threshold and maximum repairs per card. Preserve non-negotiable assignment constraints independently of editable guidance.
3. Import all available original assets into an immutable anchor catalog with source/hash/set provenance. Preserve unknown categories until visual analysis; never manufacture annotations.
4. Add cached visual library analysis keyed by source hash, analyzer model and schema version. Extract material, shape, composition, rendering and environment observations.
5. Add a reference preparation port. Rank candidates using metadata, then use structured model selection and visual analysis. Enforce anchor floor, supplemental-reference cap, unique IDs and attachment limits in code. Save selection evidence and the final prompt with each attempt.
6. Keep planning, visual art direction, generation, card verification and set verification as separate structured operations. Carry the producer brief and fixed assignment rules through generation and review.
7. Require card review and bounded corrective generation. Treat failed reviews, exhausted repair budgets and reviewer failures as unresolved work; never as production approval. Check set coherence against original references and repair identified outliers within the same budget.
8. Add user-curated reference storage and removal, separate from immutable source anchors. Preserve selected image bytes and provenance; prevent unreviewed self-generated references from entering retrieval.
9. Simplify the main screen to theme, direction and generation. Move quality controls into settings. Expose reference evidence and review findings on demand; keep EN/RU localization and both themes.
10. Validate retrieval constraints, review gates, bounded retries, persistence, supplemental promotion, exports and existing pause/resume. Run typecheck/lint/tests, exercise the packaged UI and one bounded real preparation/generation flow when available.
11. Rebuild the desktop delivery, update architecture and validation records. Report remaining source-art coverage and model-quality uncertainty explicitly.

## Boundaries

Application services own orchestration and invariants through narrow ports. Infrastructure owns Codex/OpenAI calls, files, cached analysis and image conversion. The renderer owns presentation and user intent only. Source catalogs and generated user catalogs have different trust/provenance roles. Deterministic resize/export are code services, not unconstrained agents.

## Validation gates

- Every generated card has a recorded reference selection and immutable policy/profile snapshot.
- Retrieval cannot replace original anchors with user-generated art.
- Failure to verify cannot silently pass.
- Finite per-card repairs and a finite total image budget always apply.
- Production export requires passed card and set reviews; incomplete historical runs remain inspectable.
- A giant prompt or maximum attachment count is not accepted as evidence of style fidelity.

## Implemented components

| Responsibility                                                    | Implementation                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Policy schemas and recorded selection evidence                    | `src/shared/StyleContracts.ts`                                            |
| Original catalog import and hash verification                     | `scripts/prepare-library.ts`, `resources/library.json`                    |
| Immutable originals, approved user library and persisted settings | `src/infrastructure/ReferenceLibrary.ts`                                  |
| Weighted retrieval, anchor floor and user-reference cap           | `src/application/style/ReferenceRetriever.ts`                             |
| Library analyst, brief analyst and visual art director            | `src/infrastructure/style/CodexStylePreparation.ts`                       |
| Generation and independent card/set verification calls            | `src/infrastructure/CodexProvider.ts`, `OpenAiProvider.ts`                |
| Complete reference transport within native attachment limits      | `src/infrastructure/ReferenceImagePacker.ts`                              |
| Orchestration, budgets, automatic repair and pause/resume         | `src/application/RunService.ts`                                           |
| Resolution, opacity, sRGB output and approved export              | `src/infrastructure/ImageFiles.ts`, `src/infrastructure/ExportService.ts` |
| Minimal producer screen, settings, library and evidence           | `src/renderer/`, separate EN/RU catalogs                                  |

These specialist agents are bounded structured model tasks. Deterministic application code controls their order, validation and side effects. Resizing, file integrity, budget enforcement and export are ordinary tested services. There is no free-running agent swarm or vector database claim.

Real indexing, calibration results, packaging checks and remaining assignment deliverables are recorded in `VALIDATION.md`. Application implementation does not imply that the three final cinema sets or the external submission are complete.
