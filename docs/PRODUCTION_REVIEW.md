# Production readiness and source-context audit

## Decision

The application has a sound foundation for a supervised, single-user art-production pilot. It is not yet proven as an unattended production system with predictable acceptance rates. A professional architecture cannot guarantee that a probabilistic image model matches an art style, and a model score is not independent art approval.

## Findings and changes

1. **Source context was incomplete. Fixed.** Individual cards were indexed, but complete collection layouts and category illustrations did not reach planning or set review. Seven original documents and all 25 non-card images now have explicit provenance, hashes and roles. The three operative documents (assignment, collection structure, composition rules) are supplied verbatim, alongside the current run scope. Sixteen set sheets and five category figures are visually analyzed and cached. Relevant full sets are semantically selected; ordinary categories are attached as composition examples. Category 5 is analyzed only as an exclusion example. Four result templates remain delivery material, never positive generation references.
2. **Set approval was too coarse. Fixed.** The old verifier saw a 5×2 candidate contact sheet, original individual cards and a single coherence score. The new verifier also receives relevant original set layouts and rule figures, returns six explicit quality dimensions, visual category coverage, duplicate-subject findings and card-specific corrections. Numerical gates are enforced in code. Set review history and exact reviewed image-version IDs are saved; changing a selection invalidates production approval.
3. **Default batch size was costly. Fixed by user request.** New Set now accepts 1–5 variants, default one. Exactly ten cards are planned per variant; request caps scale with the selected count and configured repairs. Choosing one is an economical working mode, not a claim that the assignment's 3–5 candidate requirement is already fulfilled.
4. **Style quality remains uncalibrated. Open.** The first complete legacy detective set was rejected by the new source-aware reviewer: style 3/5, thematic cohesion 4.5/5, palette and composition balance 3.5/5. It identified naturalistic rendering, dark lower-row backgrounds and a clipped pen. This is useful failure detection, not evidence that all new generations will pass.
5. **Provider reliability remains a deployment constraint. Open.** The validated subscription adapter depends on a particular installed native Codex CLI and its image tool. Five-path attachment limits require transport sheets. The API adapter has not completed a live image run because account credits were exhausted. Keep this tool supervised until provider compatibility and recovery have been exercised on the target installation.

## Architecture decisions

- Use a deterministic workflow with bounded specialist model calls. The model interprets the brief, analyzes images, selects source examples and proposes corrections; application code owns state transitions, budgets, eligibility, snapshots and exports. Autonomous tool-choice loops are unnecessary for fixed file conversion, configuration validation and budget accounting.
- Mandatory source requirements are always present. They are not optional retrieval hits that can disappear because a similarity score was low.
- Keep source documents, whole-set examples, composition figures, original card anchors and approved generated supplements as distinct context roles. A UI frame or gold-character example must not become a positive object-style reference.
- Card retrieval uses weighted lexical search over visual captions plus visual reranking. Whole-set retrieval uses semantic model selection over all analyzed source-set descriptions. Neither path is an embedding-vector database.
- An embedding is a numeric representation used to compare semantic or visual similarity. A vector database stores/searches such representations; it does not itself analyze style or enforce an assignment. At this corpus size an in-memory vector index would be sufficient if an embedding experiment demonstrates better retrieval. Adopt hybrid lexical/embedding retrieval only after measuring recall and final art quality against a held-out reference-selection set.
- Existing runs retain their historical source-profile snapshots. Full source context and the strict set-v2 protocol apply to new runs. Historical results are not silently relabeled as produced with the new context.

## Next acceptance evidence

1. Render one complete fresh ten-card set with the new source context and strict policy; record all repairs and actual usage.
2. Have a human art reviewer compare blinded original/generated cards across all four composition categories. Measure false approvals and rejected acceptable art, not only model scores.
3. Use held-out material/shape/genre queries to compare current retrieval with optional embeddings. Do not add a vector service without a demonstrated improvement.
4. Exercise quota exhaustion, process interruption, disk-write failure and provider-version changes on the target machine; confirm resumability and preservation of image versions.
5. Complete the required final cinema sets and source comparisons before publishing the assignment.

## Implementation map

- `scripts/prepare-knowledge.ts`: reproducible source import.
- `KnowledgeContracts`, `SourceKnowledgeStore`: roles, validated provenance and immutable content-addressed images.
- `SourceContextPort`, `CodexSourceContext`: cached set/category analysis and query-specific selection.
- `PromptBuilder`: authoritative text plus derived context and shared review rubric.
- `RunService`, `SetRules`: orchestration, exact version binding and quality gates.
- `SourceKnowledgeView`, `SetReviewDetails`: inspectable source material and dimension-level results without expanding the main generation workflow.

## Primary architectural references

Anthropic distinguishes predefined workflows from model-directed agents and recommends adding complexity only when justified: [Building effective agents](https://www.anthropic.com/research/building-effective-agents).

Qdrant documents hybrid semantic/lexical retrieval and fusion; this explains an optional extension, not a dependency currently present in the application: [Hybrid search](https://qdrant.tech/documentation/search/text-search/hybrid-search/).
