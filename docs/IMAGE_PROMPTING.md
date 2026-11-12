# Image prompting contract

Reviewed against [OpenAI's image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting) on 2026-11-12. This implements applicable prompting guidance for ordinary collectible object cards; it is not a guarantee of artistic quality or a model migration.

## Canonical rules and data flow

`resources/production-requirements.json`, section `image-prompting`, is the canonical English production policy, visible in Generation rules. Prompt templates remain in `resources/prompts/production.json`. Requirements and templates are snapshotted with each new run profile; later edits do not change an active or resumed run.

| Concern                        | Authored/planned contract                                          | Generation and verification                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Deliverable, scene and subject | Brief, card subject/description/role                               | Labeled card prompt, producer wishes and output constraints                                                                                |
| Materials, shape and texture   | `visual.materials`, `visual.silhouette`, shared material treatment | Art director inspects originals; card review receives planned visual requirements                                                          |
| Composition                    | `visual.composition` and assigned category                         | Explicit viewpoint, orientation, scale, placement, margins and background; independent category check                                      |
| Style, color and light         | Shared rendering/lighting contract and `visual.paletteRole`        | Concrete art direction under original reference authority; card and set review                                                             |
| References                     | Selected original evidence with hashes and take/ignore directions  | `GenerationRequestBuilder` numbers the exact image array; category diagrams and supplemental art have distinct purposes                    |
| Revision                       | Actionable correction and selected attempt                         | Previous immutable master is appended as the last input and identified by attempt ID; preservation is subordinate to the accepted contract |
| Exclusions                     | Content rules and accepted art contract                            | No text, logos, watermarks, people, frames or unrelated objects; complete silhouette and thumbnail checks                                  |

`PromptBuilder.sourceContext` includes active requirements even without a knowledge corpus. Planning resolves concrete choices into existing typed fields; independent plan review rejects vague or contradictory art direction. The visual selector also receives the operative requirements. It builds on the accepted plan instead of replacing its style.

`CardProductionService` wraps both prepared and fallback prompts through `GenerationRequestBuilder` before calling either provider. The request records producer wishes, numbered art/source inputs and revision context in the persisted attempt prompt. Codex transport packing retains these original input numbers in its position mapping. The OpenAI adapter preserves the same array order. Review receives original references and category evidence, excluding the previous generated candidate so it cannot become style authority.

The additive `generation.context.v1` template opts a saved catalog into numbered requests and revision-base inputs. Historical catalogs without that key remain valid and keep their previous generation behavior; the new template is never silently inserted into them. Existing template placeholder contracts are unchanged.

## Applicable scope and controls

- People/pose/gaze and exact typography recommendations do not apply because these cards forbid people and text. Photorealistic prompting would contradict the original stylized rendering. Source references remain authoritative.
- Request one image and the smallest coherent correction. A review may identify related defects; do not force a one-word edit that leaves the approved brief unsatisfied. Pixel-identical preservation is not promised.
- Respect the producer's selected quality and budget. The API adapter submits that quality directly; Codex quality remains a prompt intent because its native tool owns the control. Do not claim equivalence or silently raise cost.
- Codex requests portrait art. The existing API adapter uses a square generation canvas with crop-safe margins; delivery is a centered 430×480 crop. This is an adapter constraint, not native portrait generation. Reviews inspect the delivered crop for clipping. Output positioning remains probabilistic.
- Keep independent plan approval, pilot gating, bounded repair, current-version approval and whole-set/export checks. Prompt compliance cannot prove visual compliance.

## Offline verification

`tests/GenerationContext.test.ts` checks requirement propagation through all stages without a corpus, planned visual details in review, exact numbered input order, revision-base behavior, historical catalogs, and both provider adapters. The API transport is intercepted locally and the Codex worker is mocked; neither generates art or uses real credentials. Its production-service cases verify that a revision receives its selected immutable master and reviewers retain only original evidence. Existing workflow tests exercise pilot/plan failures, interruption, resume and export gates.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. These establish contract and transport behavior. A separate authorized generation and human visual comparison are required to assess artistic results.
