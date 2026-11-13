# Collection Studio — Application Architecture

## Scope and priorities

These rules apply to this application, not to game-engine runtime modules. Follow explicit user instructions, then these project rules, existing contracts and parent/global guidance. Preserve source art, user data, existing changes and historical runs. Write comments and technical documentation in English; discuss work with Alex in Russian.

## Architecture

- Domain owns deterministic rules and invariants. Application owns use cases and narrow ports. Infrastructure owns filesystem, providers and process execution. Presentation owns view state and user interaction. Main/preload are Electron composition and transport boundaries.
- Enforce inward dependencies. Domain/application must not import Electron, React, provider SDKs or concrete infrastructure. UI must not directly access filesystem or model providers.
- Use MVVM for the React UI: views render state and call intent methods; ViewModels own asynchronous actions, subscriptions and screen state through an injected StudioApi. Keep domain decisions in domain/application, not JSX.
- Apply SRP, SOLID (OCP/LSP/ISP/DIP), KISS, DRY, SoC, high cohesion/low coupling, Dependency Rule, YAGNI, Law of Demeter, CQS, explicit dependencies, immutable values where practical and isolated side effects. Prefer demonstrated abstractions over speculative frameworks.
- Classes own mutable lifecycle/state; one runtime class per file. React functions/hooks remain idiomatic. Subscriptions and setup must have matching cleanup.
- Use strict TypeScript and schema-decoded boundaries. No any, unsafe double casts or non-null assertions. Invalid contracts fail before generation.

## Authored content and production workflow

- Store model prompt text in editable JSON configuration, not business orchestration. Templates have explicit validated placeholders; no eval. Keep hard invariants in code and tunable policy/content in validated configuration.
- Author, edit and persist generator rules in one canonical source, initialized in Russian from substantive Miro text. Preserve user edits and historical snapshots during migration. UI localization must never translate or maintain separate language copies of rule bodies. Keep source quotations distinguishable from authored operational guidance.
- Keep applicable OpenAI image-prompting guidance in `resources/production-requirements.json` and propagate it through planning, generation and verification. Bind reference roles to actual numbered inputs; revisions must identify their previous candidate and preservation constraints. Preserve historical prompt snapshots. See `docs/IMAGE_PROMPTING.md` for scope and verification.
- Every new set has ten subjects, all four ordinary composition categories, a validated category allocation, a shared art contract and a validated slot plan. New runs allocate slots and retrieve catalogue references before one model design call; validate that design deterministically and visually verify the generated artwork. Do not repeat unchanged source-reference analysis or add a redundant model plan review. Structural subject-plan corrections may be bounded; artistic rendering scores must not gate production. Keep unresolved planning evidence in diagnostics without producer-facing warnings.
- Generate all ten cards through the same bounded worker pool; do not select or gate on a pilot. New runs use optional composition-only verification without numeric artistic scores or whole-set artistic grading. Codex CLI is the only generation provider, with Terra as the default model. Settings snapshot independent per-card and whole-set correction limits, both defaulting to 0; zero disables that verification stage. Positive limits allow only explicit mandatory card defects and concrete whole-grid relationship corrections, with bounded persisted attempts and repeated verification. Record failed/unknown observations in diagnostics without producer-facing warnings. Manual regeneration remains available from the card drawer; automatic corrections preserve all originals and bind every revision to its exact previous candidate. Structural validity, real provider availability, image identity, explicit pause and request budgets remain enforced. Select card references by the actual slot category and required composition facets; never prepend fixed unrelated rendering examples. Preserve original reference authority, image identity and budget limits across pause/resume. Record explicit protocol transitions when a user resumes or regenerates an archived run; preserve its historical reviews.
- Plan full-grid color/pattern relationships before model design. For new rhythm contracts, prohibit repeated color-family/pattern pairs and equal color families in horizontal/vertical neighbors of the 5×2 grid. Distinguish observed source statistics from stricter user-authored product constraints.
- Original source images are immutable. User-approved art is supplemental. Preserve hashes, selection reasons, prompt/config revisions and review evidence. Never silently reinterpret historical runs under a new protocol.
- Keep EN/RU localization in separate catalogs, default to detected device language with English fallback. Preserve dark/light themes and the simple producer-facing UI.

## Verification and scope

- For code/config changes run npm run typecheck, npm run lint, focused behavioral tests and the applicable build. Exercise gates, interruption, legacy reading and export rather than testing implementation wording.
- Do not run image generation or resume existing runs as part of routine refactoring. Static/offline checks are the default; clearly report the limits of validation.
- Do not publish, commit broadly, change shared SDKs or expose private sources/credentials. Stage only intended files when staging is requested.
- Keep optional raw exports and research only under ignored `local-sources/`; see `docs/LOCAL_SOURCES.md`. Build assets live in tracked `resources/`. Reuse their original bytes through relative symbolic links in the local export instead of keeping duplicate images or recreating root art/reference folders.
- Keep exactly one current packaged release at `release/mac-arm64/Collection Studio.app`. Do not create named release subdirectories. Replace the canonical build only after successful verification; keep temporary packaging outside `release` and remove obsolete builds.
