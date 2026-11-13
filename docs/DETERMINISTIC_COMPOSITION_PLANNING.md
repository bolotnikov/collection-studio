> Historical protocol: new runs now use [aggregate composition planning](AGGREGATE_COMPOSITION_PLANNING.md). The source-prototype flow below applies only to frozen older profiles.

# Source-prototype composition planning

## Scope

New runs with a prepared catalog use `source-prototype-v1`. Rendering remains anchored to the frozen canonical rules and original reference pixels. No classifier or image model is trained. This change controls composition distribution and subject assignment; it does not establish measured improvements in image style fidelity.

Historical profile snapshots without `compositionPlanning` keep the previous planning protocol. Existing generated images, source catalog labels and accepted run contracts are not rewritten. The Codex structured-output compatibility fix remains in place.

## Flow and ownership

1. The existing source curator retrieves related source-set context from the prepared catalog. This is a text-model task, not a fresh catalog analysis.
2. `CompositionPlanningPort.proposeSubjects` asks the model for coherent concepts, ten primary subjects and up to four reserves. Candidates have distinct IDs, narrative roles, materials, silhouettes, ordered compatible categories and an explicit actor count. Ordinary objects and category-5 narrative candidates cannot share compatibility lists.
3. `SourceCompositionPlanner` selects a complete real source layout. It preserves the ordered joint category, background type, context density and actor-count distribution. It never builds a layout by independently rounding empirical marginal averages.
4. Minimum-cost matching assigns ten distinct compatible candidates to the ten slots. Category preference and reserve position influence the cost. A candidate's actor count must match its slot. Relevant retrieved sources are preferred; deterministic tie-breaking and a repeat-source penalty allow reproducible multi-set planning without a hardcoded category ratio.
5. `describeComposition` receives the frozen blueprint and adds descriptions, scene details and palette roles. Its response schema has no subject/category/rendering/allocation fields. `CompositionPlanCompiler` owns these fields and copies canonical rules into the shared rendering contract.
6. Domain validation checks all ten slots, gold mode, source lineage, documented adaptations and reference coverage. The independent model plan review then checks meaning, visual diversity, style fidelity and producer wishes, including contradictions between prose and hard facets.
7. The pilot gate, visual reference selection, per-card verification, bounded repairs and final set verification continue to operate. Final verification always includes the accepted source prototype as the first clean reference sheet, alongside other references.

## Source feasibility and controlled adaptations

A prototype must have ten distinct members/pixels, a clean sheet, confident observations, all four ordinary categories, and the requested gold mode. Every target needs at least two distinct confident original reference images. Supplemental art does not satisfy this floor when working-library provenance is available.

Rare source combinations sometimes lack two references. The planner may substitute support, pattern subtype or depth within the same category, backdrop, context-density and actor-count tuple. It records the source values and every changed facet. By default at most two slots may be adapted; a zero limit requires an exact prototype. No broad fallback silently changes environmental backgrounds into plain ones. Unsupported prototypes are excluded, and an infeasible proposal stops before image generation.

`resources/composition-planning.json` contains validated policy weights, adaptation limits and task templates. This configuration is copied into each new run's immutable profile. Global rendering is still edited in the existing canonical style rules, not in a new generated style description. Camera, scale, position and background hue are inherited as preferences; required composition facets are enforced. The semantic model can still make incorrect compatibility judgments; the separate plan review and visual verification are necessary.

## Persistence and verification

`compositionDraft` checkpoints semantic candidates and the selected blueprint before description. A transport failure during description resumes the same assignment without spending another semantic-planning request. Plan-history entries retain their associated draft, including failed proposals. Existing plan repair limits bound semantic/description revisions. Source configuration/catalog identity, slot provenance and the accepted plan signature remain in diagnostics.

Runtime composition state includes planned, accepted and remaining facet counts. These are derived from the selected verified versions, so discarded attempts and retries cannot increase the counts. Future slots remain fixed; the system repairs a mismatching result rather than quietly moving its quota elsewhere.

Offline checks:

```sh
npm run typecheck
npm run lint
npm test
npx tsx scripts/audit-composition.ts
```

The audit checks the actual private prepared catalog without calling any model. The current 160-card / 16-set catalog has three feasible ordinary and two feasible mixed prototypes under the default policy. This is a feasibility result, not a visual-quality benchmark; other sets remain reference evidence. A controlled fresh-generation comparison with human judgment remains necessary to measure artistic improvement.

## Producer-facing progress and inspection

The generation screen exposes the selected source prototype and the ten planned slots as soon as the blueprint is persisted. Proposed blueprints are distinguished from reviewed production plans. Slot details separate required/preferred patterns from observations of the selected image; missing observations are not represented as verified tags. Historical runs without a slot contract are explicitly identified.

Planning publishes concept selection, deterministic slot assignment, description and review phases. Each in-flight card reports reference preparation, generation or verification with subject, slot number and retry number. Parallel cards retain separate activities. Set assembly and whole-set comparison are also reported. Activities are cleared on completion/error and reset on resume.

Overall progress counts completed milestones: one reviewed plan, ten selected images, ten accepted card reviews and one accepted final set review per set. Retries do not accumulate progress. The percentage measures accepted work, not elapsed time or a prediction of completion; it can decrease when an accepted version is replaced. 100% requires the existing delivery acceptance gate. No estimated progress is invented while a model request is waiting.
