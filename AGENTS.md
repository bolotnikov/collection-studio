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
- Every new set has ten subjects, all four ordinary composition categories, a validated category allocation, a shared art contract and a separately reviewed plan.
- Generate and verify a pilot before the remaining cards. Failed/unknown review blocks downstream production. Preserve original reference authority, exact-version approvals, bounded repairs and budget limits across pause/resume.
- Original source images are immutable. User-approved art is supplemental. Preserve hashes, selection reasons, prompt/config revisions and review evidence. Never silently reinterpret historical runs under a new protocol.
- Keep EN/RU localization in separate catalogs, default to detected device language with English fallback. Preserve dark/light themes and the simple producer-facing UI.

## Verification and scope

- For code/config changes run npm run typecheck, npm run lint, focused behavioral tests and the applicable build. Exercise gates, interruption, legacy reading and export rather than testing implementation wording.
- Do not run image generation or resume existing runs as part of routine refactoring. Static/offline checks are the default; clearly report the limits of validation.
- Do not publish, commit broadly, change shared SDKs or expose private sources/credentials. Stage only intended files when staging is requested.
