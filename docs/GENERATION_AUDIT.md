# Generation audit — 2026-11-13

## Scope and fixed inconsistencies

The audit follows new-project creation through corpus allocation, structured design, input preparation, image generation, individual and whole-set reviews, bounded corrections, persistence, pause/resume and export. Both Codex and OpenAI adapters were read. It does not claim that a model always follows a valid prompt.

- Removed unconditional shared rendering examples from planned-card presentation and generation selection. The former first two profile references were an academic cap and a calculator; they were unrelated to many slot patterns.
- Removed the special first-card stage, its blocking conditions, priority ordering, generated contract fields, UI text and operational prompt instructions. Old persisted fields remain readable solely for archived evidence/signature compatibility.
- Fixed category-mismatched fallback inputs and removed the unconditional four-original minimum from the retrieval helper.
- Freeze category, required joint facets and exact selected reference IDs before the design request. Select every exact match up to eight; never add unrelated images to reach eight. All selected originals stay attached, rather than stopping at minimum role coverage. Preserve this identity and order through revisions and verification.
- Removed subject-driven slot replanning. Contradictory subject metadata triggers bounded correction requests. The last structurally valid proposal can continue with explicit compatibility warnings, while original slots and references remain unchanged.
- Moved design-output decoding inside the bounded correction boundary. Invalid structured replies no longer escape it immediately.
- Removed the unused requirement for a Codex connection when an API-provider run only needs the already prepared catalogue. Actual provider availability and missing prepared evidence still remain real requirements.
- Technical image failures retain an error status and message. An explicit pause, invalid image output, missing files or request limits are not misreported as successful artistic completion.

## Current algorithm

1. Load the prepared catalogue and freeze the run snapshot.
2. Fit ten integer slots to aggregate category and joint visual-pattern statistics, respecting gold mode.
3. Select and freeze up to eight exact original-reference matches per slot.
4. Ask the design model once for the set concept and ten compatible subjects/descriptions, using structured output.
5. Validate structure, source bindings and model-declared compatibility. Request bounded subject corrections only when necessary; never change the slot contract.
6. Assemble image prompts in code from canonical shared rules, the shared art contract, the current slot and its frozen references. Add only the applicable category figure as separately labelled composition context.
7. Produce individual images through the bounded worker pool, without a pilot gate.
8. Visually review each card against its request and original references. Compare reported facets with the frozen requirements in code.
9. Revise failing cards within the per-card limit and total image budget. Keep prior versions and retain the stronger version when a revision is worse.
10. Assemble the ten selected cards, visually compare the whole set with multiple clean reference sheets and apply bounded targeted corrections.
11. Save deliverables, exact input manifests, findings and execution logs. Complete with quality warnings when artistic correction limits are exhausted.

Normal successful execution for one set is 22 application-level provider operations: one design, ten images, ten card reviews and one set review. There is no unchanged-library analysis, per-card model reference selection, second descriptive request or separate model plan review in the new protocol.

## Verification and evidence

- 221 offline behavioral tests across 34 files passed.
- Typecheck, ESLint and production build passed.
- `npx tsx scripts/audit-slot-inputs.ts` checked twenty real-corpus slots: ten ordinary and ten mixed/gold, using sixteen source sets and 160 classified originals. It verified exact required-facet matches, frozen input identity/order, source SHA-256 integrity, applicable category figures and generation input manifests. The audit runner rejects every model invocation; model and image call counts were both zero.
- The real-corpus check selected between two and eight images per slot. A slot with five exact candidates retained all five; an eight-candidate slot retained all eight. Full captures are in ignored `output/slot-input-audit/requests.json`; summary evidence is in `output/slot-input-audit/report.json`.
- The bundled visual catalogue hash remained `f95e48fa87c6e897cc18d5fd85c6fd35b87b79ea47b16d1a1dc4d7cbc14e6229`.

Code-level compatibility means consistency of the model's declared fields; it cannot establish whether the subject is physically or artistically appropriate. No new artwork was generated for this audit. Model visual judgments, target-style fidelity and real provider execution remain empirical properties that offline tests cannot guarantee.
