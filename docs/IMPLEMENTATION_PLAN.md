> Current style-first implementation supersedes the original reference/repair strategy below. See [STYLE_PIPELINE_IMPLEMENTATION_PLAN.md](STYLE_PIPELINE_IMPLEMENTATION_PLAN.md) and [STYLE_ARCHITECTURE_RESEARCH.md](STYLE_ARCHITECTURE_RESEARCH.md).

# Collection Studio implementation plan

Date: 2026-11-12. Target: a usable macOS Electron application for today's test assignment.

## Outcome and acceptance criteria

The interface supports English and Russian via separate typed catalogs. Device language is the default, with English fallback and an explicit override in Settings. Persistent Dark/Light palettes follow Photoshop-style neutral grays.

The producer enters a set theme and free-form wishes, selects 3–5 variants, and starts a run. The application plans ten distinct objects per variant, renders complete sets using the supplied art style, evaluates individual cards and set coherence, performs bounded repairs, and exports images and an audit trail. No terminal or author assistance is required during ordinary use.

- Every finished variant contains ten image files and categories 1–4.
- No gold cards or character scenes in the cinema deliverables.
- Three cinema genres and three generated variants per genre yield at least 90 candidate images and 30 selected final cards.
- Reference artwork has opaque illustrated backgrounds. Do not remove them.
- Reference-size previews are 430 × 480; retain generated masters unchanged.
- Failed or interrupted work is visible, resumable, and never reported as completed.
- Model scores are advisory. Record concrete findings and preserve manual decisions.
- Store prompts, reference IDs/hashes, model/settings, attempts, evaluations, timings and usage without credentials.

## Existing evidence

- [x] Read all textual requirements and the structure of all four Miro frames.
- [x] Download and visually inspect 120 original cards, organized into 12 inferred sets.
- [x] Preserve manifests, checksums, source code references and contact sheets.
- [ ] Retrieve the remaining 65 images. Blocker: daily Miro MCP quota; private board requires browser sign-in.
- [x] Inspect Asset Studio, Vehicle Generator, ComfyUI and IP-Adapter source code.
- [x] Save the user-provided API key in ignored `.env` with owner-only permissions.
- [x] Validate authentication using the models endpoint. This does not establish available credit or successful generation.

## Architecture

Electron renderer (React and TypeScript) → typed preload bridge → application services → domain rules and narrow ports → Codex CLI / OpenAI API and filesystem adapters.

**Provider update:** Native Codex CLI image generation through ChatGPT authentication was verified with a real PNG, reference-conditioned calibration and structured visual review. It is the default backend. OpenAI API remains optional and separately billed; its live request was blocked by zero credits. No ChatGPT tokens are extracted or exchanged. Codex quality is a prompt preference, not an exact API parameter.

The application is independent of the game SDK. No shared SDK changes or extraction are part of this scope.

| Boundary         | Responsibilities                                                          |
| ---------------- | ------------------------------------------------------------------------- |
| `shared`         | Zod boundary schemas, serializable DTOs and bridge contract               |
| `domain`         | Set invariants, category coverage and run budget rules                    |
| `application`    | Planning, durable run execution, review, retry, resume and selection      |
| `infrastructure` | OpenAI HTTP/SDK calls, file storage, image processing and exports         |
| `main`           | Electron lifecycle, narrow IPC registration, dialogs and composition root |
| `preload`        | Explicit methods only; no raw IPC, credentials or filesystem APIs         |
| `renderer`       | Producer form, progress, gallery, comparison, history and settings        |

Use one runtime class per service file and strict TypeScript. React components remain ordinary presentation functions. External payloads must pass schemas. Keep authored style and category rules in editable JSON. Persist run snapshots atomically and retain every image attempt; a database is unnecessary for this single-user first version.

## Phase 1 — Foundation

- [x] Scaffold Electron + React + TypeScript with a lockfile, lint, typecheck and production build.
- [x] Configure isolated, sandboxed renderer and a minimal validated IPC bridge.
- [x] Load secrets only in the main process; expose readiness, never keys.
- [x] Add a style profile containing category definitions, style rules and curated reference filenames.
- [x] Import existing reference files through a preparation script; retain provenance.
- [x] Store runs under an application data directory, with a workspace override for development.

Acceptance: the desktop application opens, shows the actual reference library and API status, and exposes no Node or credential access in its renderer.

## Phase 2 — Real generation vertical slice

- [x] Implement OpenAI provider with explicit model selection and automatic SDK retries disabled for image generation.
- [x] Validate actual model access. API defaults are `gpt-image-2` and `gpt-4.1-mini`, both returned by the account model list. Codex uses `gpt-6.1-sol` for planning/review and native ImageGen for rendering.
- [x] Generate one novel cinema object using category-matched references and a specific style brief.
- [x] Save original bytes, a normalized card preview and full request metadata.
- [x] Inspect the result beside the references before scaling generation.

Do not interpret an HTTP timeout as proof that a paid image request did not execute. Record an uncertain outcome and require deliberate resumption rather than immediate blind repetition. Surface quota, permission and model errors without changing providers silently.

Acceptance: a real generated image is visible in the app and survives restart. Technical decoding and visual inspection both pass.

## Phase 3 — Autonomous set production

- [x] Plan 3–5 distinct interpretations of the requested set using structured outputs.
- [x] Validate exact variant/card counts, unique IDs, unique subjects and category coverage before spending on images.
- [x] Use categories 1/2/3/4 in a proposed 3/3/2/2 distribution; the assignment does not mandate this distribution.
- [x] Persist the plan and schedule card jobs with bounded concurrency.
- [x] Reuse fixed style anchors and category-specific references without copying their subjects.
- [x] Preserve complete cards across pause, restart and resume.
- [x] Implement explicit run states: planning, generating, reviewing, completed, paused, failed.
- [x] Track attempted image calls and maximum repair count. The UI displays image-request counts; monetary estimates are omitted because native Codex does not expose a stable per-image price. Planning/review and native retries may consume additional usage.
- [x] Stop scheduling new work on pause/cancel. In-flight remote work may still finish and incur usage.

Acceptance: one run produces three complete ten-card variants. Resume does not regenerate already completed images. Errors are attributable to a particular card and attempt.

## Phase 4 — Quality and repair

- [x] Technical checks: decodable image, size, expected aspect ratio normalization and file existence.
- [x] Card review: subject, category, silhouette/readability, style, materials, background and defects.
- [x] Set review: theme coherence, duplicates, category balance and stylistic outliers.
- [ ] Calibrate model review on a small set of reference and generated examples.
- [x] Apply at most one automatic repair per failing card by default, within the call cap.
- [x] Preserve earlier attempts and support manual selection/locking of a successful card.
- [x] Present unresolved defects as “needs review”; do not label them production-ready.

Acceptance: the user sees why an image was rejected, can compare attempts, and can retain an earlier version. Review failure must not discard generated files.

## Phase 5 — Producer interface

- [x] Localized EN/RU labels, guidance, system statuses and known application errors; generated content and provider diagnostics retain their original language.
- [x] Persistent Dark/Light themes with compact editor panels, neutral grays and blue selection accents.
- [x] Provider selector for Codex/ChatGPT and OpenAI API, with separate connection checks.

- [x] Project sidebar with durable run history and a clear new-set action.
- [x] Brief form: theme, wishes, variant count, generation quality and attempt cap.
- [x] Progress with completed/total cards and actual stage labels.
- [x] Variant tabs/grid, actual-size preview and a reference comparison panel.
- [x] Card detail with subject/category, critique, attempts, rerender and lock/select controls.
- [x] Export controls and visible connection/setup feedback.
- [x] Empty, loading, paused, failure and partial-result states.

Keep model IDs, prompts and raw traces in an expandable details area. Normal users should see production tasks rather than implementation internals. Do not build a generic graph editor, training UI, subscription service or cloud collaboration for this submission.

## Phase 6 — Export and delivery

- [x] Export selected variant as ten PNGs, contact sheet and JSON manifest.
- [x] Include a run report with brief, planning rationale, comparison, all attempts and unresolved findings.
- [x] Preserve the original generated masters separately from card-size outputs.
- [x] Include source attribution and instructions for importing employer-supplied private references.
- [x] Build the macOS app bundle and document launch/setup.
- [ ] Prepare Miro-ready analysis, experiments and final sets. Manual placement into supplied set templates is allowed by the assignment.
- [x] Prepare GitHub-ready code and README; do not publish credentials or raw private reference art.

## Phase 7 — Validation and cinema deliverables

Twelve offline tests pass, including locale resolution and catalog parity. Native app launch, both themes, actual source images, Codex login and a real four-image pause were verified. The first full thirty-image run is underway; it is not yet a completed final set.

- [x] Run `npm run typecheck`, `npm run lint`, focused domain/orchestration tests and production build.
- [x] Test malformed model responses, category gaps, pause/resume, call cap and partial failures without paid calls.
- [ ] Perform desktop UI checks and one real end-to-end API run.
- [ ] Generate candidate sets for detective, space science fiction and adventure fantasy.
- [ ] Choose one complete final variant per genre; verify all 30 final images at reference size.
- [x] Record any manual interventions and distinguish live evidence from offline fixtures.
- [ ] Compare another public model on a small matched benchmark if account access and the agreed budget permit; otherwise disclose this unmet research criterion.

## Production priorities and stopping conditions

Finish the real generation path before polishing the gallery. Prioritize working autonomous generation, art consistency and export over optional features. A model listing alone is not a successful generation test; a mock gallery is not a delivered pipeline; three textual plans are not three image variants.

If credits or model permissions block generation, continue implementing and validating the application using clearly labelled fixtures, preserve the exact blocker, and do not silently spend through another account/provider. If the Miro quota remains exhausted, retain the 65 pending records rather than claiming complete reference coverage.

## Sources

- Assignment: https://miro.com/app/board/uXjVEOqNGVA=/
- Image API: https://developers.openai.com/api/docs/guides/image-generation
- Structured output: https://developers.openai.com/api/docs/guides/structured-outputs
- Electron boundary: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Asset Studio source: https://github.com/joe-lloyd/game-asset-generation/blob/main/src/main/comfy.ts
- Vehicle Generator source: https://github.com/mohabash/ai-game-asset-generator/blob/main/api/submit.js
- Scenario workflow: https://help.scenario.com/articles/7094354401-building-workflows-in-scenario

- Native Codex image generation: https://learn.chatgpt.com/docs/image-generation
- Codex structured non-interactive execution: https://learn.chatgpt.com/docs/non-interactive-mode
