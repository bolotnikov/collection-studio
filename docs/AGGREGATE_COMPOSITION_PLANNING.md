# Aggregate composition planning

New runs use `aggregate-pattern-v1`. The source-prototype protocol is historical only. No source set is selected as the layout for a new composition.

## Corpus and conditioning

Every available complete source set contributes. Each member is joined by ID and pixel hash to its observation. Statistics count the **joint** category/support/backdrop/pattern/depth/context-density/actor tuple, not independently sampled tags. Each set has equal weight. In ordinary mode gold members are removed and each remaining source's object distribution is normalized to ten slots; a fully narrative source has zero ordinary observations and is recorded but cannot supply ordinary counts. In mixed mode all members contribute. The current private corpus records 16 sets, with 15 ordinary contributors and 16 mixed contributors.

The model records expected counts for all observed joint patterns, including rare unsupported patterns. Generation choices require at least two distinct, sufficiently confident original images matching the entire tuple. Unsupported patterns remain in the statistical loss rather than silently disappearing from the evidence. Reference coverage can prevent an exact fit to the empirical mean.

## Deterministic new-slot allocation

The planner enumerates ten-card category allocations with categories 1–4 present and category 5 absent/present according to the producer's checkbox. Per-category joint-pattern counts are fitted deterministically to the empirical distribution. The score includes category count error, joint-pattern count error and visual-axis balance error; weights live in `resources/composition-planning.json`. Fractions are resolved into integer slots, not treated as exact quotas. There is no source layout matching or source-theme relevance bonus in this protocol.

Distinct model-proposed subjects are matched to these slots using their compatible categories and fixed actor counts. Incompatible proposals are repaired within existing plan limits before any image call. The model describes fixed slots; it cannot overwrite their categories or required tags. The final contract retains all source IDs, expected and allocated pattern counts, coverage and the catalogue hash. Domain validation checks slot evidence/counts and original reference coverage. Independent plan review, pilot review, per-card visual verification, bounded repair, whole-set verification and exact-version export gates remain required.

Planning does not run the old set-curator request. It reads the prepared corpus and sends the aggregate profile to semantic planning. Source set selection remains available for contextual comparisons during production/review; these examples cannot determine the composition allocation. Card reference retrieval remains conditional on each slot's category and complete required tuple.

## Compatibility and limits

Profiles and runs are frozen. Existing `source-prototype-v1` runs retain that protocol, including their already accepted layouts. New runs snapshot the aggregate configuration. No historical generated files or catalog classifications are rewritten. This algorithm is deterministic given the same corpus, policy and semantic candidates. It is an integer approximation constrained by available original references; neither matching tags nor offline tests prove artistic fidelity. Fresh artwork comparison is still required to measure that outcome.

## Offline checks

`npx tsx scripts/audit-aggregate.ts` performs both modes against the actual private catalogue without model calls. On the current corpus the ordinary allocation is 3/1/2/4 and the mixed allocation is 2/1/2/3/2 for the synthetic flexible subjects. These are computed outputs, not constants. The unit fixture combines source allocations 4/2/2/2 and 2/2/4/2 into 3/2/3/2, demonstrating that the result is not either source layout. Tests also cover deterministic ordering, missing coverage, incompatible subjects, count tampering, old-protocol resume and strict nullable transport.

## Reference coverage protocol

New prompt snapshots include `reference.coverage.v1`. The visual selector assesses every candidate for usefulness, transferable conflicts, rendering, lighting and coverage of the exact named requested materials. The final deterministic selector retains two distinct shared originals and at least two exact original composition examples (the same pixels can fulfill both roles), then adds only images that cover outstanding requirements. It never fills the budget with redundant candidates. Missing coverage or conflicting mandatory evidence stops preparation before image generation. This remains model-judged visual evidence, not a measured guarantee of style quality.

The candidate inspection pool can be larger than the generation subset. Eight is the default maximum of selected card-reference attachments; source-context attachments and the previous candidate are separate. Existing prompt snapshots without the new marker retain their previous selection behavior. New library policies use the hidden defaults of 5/5 style acceptance and eight selected references; revision count is the only exposed production limit. Existing run snapshots are not migrated.

## Reusing prepared context

New aggregate runs snapshot `ContextOptimization` (`resources/context-optimization.json`). Reference preparation reuses the producer theme/wishes and accepted concept, story and constraints; it does not call the separate brief analyst. A missing accepted art contract fails before this optimized preparation proceeds.

Comparison references are ranked deterministically against the immutable ten-slot plan. The score uses normalized category and joint-pattern histogram distances, with a bounded lexical term overlap for semantic/material relevance. At least two valid sources are retained; extra sources are added only for otherwise uncovered required joint patterns, up to four. Mixed mode requires mixed evidence and includes an ordinary source when available. The selector never chooses or changes the generated set's composition. Original screenshots, clean-sheet hashes, original-category attachment restrictions and actual visual set review remain enforced.

Prepared catalogue observations replace runtime catalogue analysis. These optimizations remove the cold-cache brief-analysis call and set-curator call (including its additional mixed-review call where applicable); actual image-reference inspection, per-card review and whole-set review remain model tasks. Tests verify zero model calls in comparison-context preparation against the real private catalogue, and retained visual reference assessment without a brief-analyst call. Frozen historical profiles without this configuration retain their prior protocol. No new image generation was used to validate the refactor.
