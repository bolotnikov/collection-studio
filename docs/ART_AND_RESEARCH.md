# Art direction and implementation decisions

## Assignment interpretation

The tool must take a **set theme** and free-form producer wishes and output 3–5 fully rendered ten-card variants. A textual plan is not a variant. The final submission requires three new film-genre sets, without gold character cards, together with analysis, comparison, process evidence on the Miro board and a GitHub source link.

All four object/composition categories must appear in every set. The reference does not prescribe their numerical distribution. The initial 3/3/2/2 planning suggestion is a design choice, not an employer rule. Card rarity does not change the object rendering.

## Principles extracted from 120 inspected cards

1. **A coherent subject family with varied silhouettes.** A set is a small story expressed through immediately recognizable objects. Avoid ten unrelated props connected only by a color filter, or ten near-identical containers.
2. **A dominant subject.** A multipart prop may count as one semantic object. Its main shape and identity-defining parts must survive the 430×480 card and thumbnail scale.
3. **Rounded, painted volumes.** Polished stylized 3D-like rendering; broad highlights, soft shading, restrained occlusion and clean contours. Dark comic outlines and photorealism are wrong directions.
4. **Material distinction.** Metal, glass, cloth, wood and plastic need different simplified visual cues. Universal glossy plastic is a common failure mode.
5. **Subject/background separation.** Saturated colors and controlled complementary contrast. A coherent set is not monochrome. Backgrounds are integral artwork, not removable padding.
6. **Four levels of context.** Floating object; object on simple surface/backplane; object on recognizable material with depth; object integrated into a readable environment while staying central.
7. **No gold-card narrative.** The final ordinary cards should avoid character scenes, rarity ornaments, frames and UI. Brass or gold-colored material is not itself a prohibited gold card.

These were initial observations from the first 120 cards. The complete local export now contains all 185 board images, including 160 individual cards. All 160 are imported into the source catalog. Category assignments are visual classifications, not labels supplied by the employer. A matched final comparison against the sixteen complete set layouts remains a submission task.

## Reference strategy

The current implementation replaces the initial small fixed pack with cached visual indexing, weighted metadata retrieval and visual reranking. A pack contains 4–12 references (eight by default), retains original category anchors and allows at most 25% explicitly approved generated examples. Every selected reference has a role, take/ignore guidance, a reason and a source hash. Preserve generated masters unchanged and derive a 430×480 preview; inspect silhouette clipping at preview size.

Eight references are a bounded working budget, not proof that all reference variation has been captured. Compare effects on category-3/4 backgrounds separately. The native Codex image tool in the tested installation accepts five file paths; the adapter preserves larger packs as complete, unscaled cards on two- or three-card reference sheets, with an explicit positional map.

## Public implementations inspected

| Source                                                                                                 | Useful implementation idea                                                    | Why it is not copied as the solution                                                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Asset Studio](https://github.com/joe-lloyd/game-asset-generation/blob/main/src/main/comfy.ts)         | Desktop IPC around generation and file results                                | Windows-oriented process setup and ComfyUI dependency; small project, not evidence of broad adoption          |
| [Vehicle Asset Generator](https://github.com/mohabash/ai-game-asset-generator/blob/main/api/submit.js) | Parameterized prompt/reference/seed injection into workflows                  | Background removal conflicts with the supplied opaque card backgrounds; small project                         |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI)                                                        | Mature reusable execution graph and broad model ecosystem                     | A graph editor and local diffusion setup add substantial work before this one-day producer workflow is usable |
| [IP-Adapter](https://github.com/tencent-ailab/IP-Adapter)                                              | Separate text semantics from image-reference conditioning                     | Requires a compatible diffusion stack; not a direct plug-in for native GPT Image generation                   |
| [ComfyUI IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)                              | Separate style and composition weights; preserve reference roles              | Maintenance status and GPL licensing must be considered before redistribution                                 |
| [Scenario workflows](https://help.scenario.com/articles/7094354401-building-workflows-in-scenario)     | Repeatable art workflows, reference selection and producer-facing abstraction | Additional service/account/cost; no account-backed benchmark was performed                                    |

At the research snapshot, the two small app examples had roughly four stars each, while ComfyUI and the IP-Adapter ecosystem were widely used. Popularity is not proof of matching this specific card-art task. Saved source excerpts and observations are in the local `local-sources/research/` evidence directory; no third-party implementation was copied into the application.

## Chosen solution

Electron provides a genuine producer-facing desktop application. A narrow provider interface supports both OpenAI Images API and the installed Codex CLI. Planning, generation and review are separate operations. The orchestrator validates structure before generating, runs two card jobs at a time, persists before/after side effects, retains every successful attempt and bounds repairs.

The initial API request was blocked by exhausted API credit. A native Codex CLI capability probe then generated a real PNG through ChatGPT authentication without an API key. A second probe used actual source references and completed generation, normalization and structured visual review. Therefore Codex is the current default, with the API adapter retained as a separately billed option.

This is **not** a direct connection to the web ChatGPT session or token-sharing API. Node spawns the authenticated CLI, passes a bounded task and reference files, and receives generated PNGs plus schema-validated JSON. Underlying image quality controls are less deterministic than the Images API; the application labels this limitation.

## Evaluation and remaining evidence

Review each card on style, subject match, readability and category correctness; review each sheet on coherence, redundancy and outliers. Enforce numerical pass thresholds in code and treat model judgments as advisory. A model judging its own ecosystem can miss defects; human comparison remains necessary.

The first reference-guided detective magnifier passed the automated rubric. Manual inspection found a complete silhouette, readable glass/brass/wood distinction and compatible rounded shading. Its highlights are relatively polished; this single card does not establish set consistency or production readiness. The initial capability-only probe lacked attached references due to a wrong file path and is not style-match evidence.

For the final submission, generate three candidate variants per genre, select one complete set per genre, inspect all 30 final cards beside original sets, record rejected attempts, and explain unresolved differences. The planned genres are detective, space science fiction and adventure fantasy. A matched small benchmark against another accessible public image model remains necessary to substantiate model selection; source-code research alone is not that benchmark.

## First full-set experiment and framing correction

The first detective variant produced ten real images. Four were rejected for edge clipping: fedora brim, telephone cord, envelope corner and pen cap. Inspecting the masters showed that square-to-portrait cropping was responsible for at least the fedora clipping; the original contained the complete brim. The initial prompt mixed a portrait safe area with a square-canvas request. The native Codex prompt now requests a 43:48 portrait canvas explicitly, with the full object inside 80% width / 86% height. The API adapter retains square output with explicit side margins.

Manual sheet inspection also found the office lighting and surface textures more realistic and dramatic than the supplied casual-game art. The common prompt now makes reference rendering take precedence over genre mood and rejects photographic grain and dark cinematic exposure. Existing attempts are retained as experimental evidence. These issues require new renders and re-evaluation; changing the prompt does not retroactively fix earlier cards.
