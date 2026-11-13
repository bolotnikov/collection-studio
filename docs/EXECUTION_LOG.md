> Current export: Russian `journal-<id>.md` for people and versioned `diagnostics-<id>.json` with run, profile and full journal for machines. Request/response disclosures are collapsed by default and include the full sanitized text without length limits, preserving source language. See [current production](COMPOSITION_ONLY_WORKFLOW.md). Earlier export details below describe the original diagnostic protocol.

# Execution evidence and export

A project records append-only observable execution evidence in `execution.jsonl` inside its run directory. Provider work is scoped to that project; Codex worker folders are stored under `_jobs/`. Library maintenance and art-direction suggestions outside a project keep their separate job directories.

- `RunRepository` records granular before/after changes at persisted workflow checkpoints: concepts, category/pattern assignments, reference selection evidence, attempts, reviews, automatic corrections and user selections.
- `CodexRunner` records logical requests, exact worker instructions, schemas, attachment paths/hashes, tool events, structured results, usage and errors. Provider methods identify the responsible executor. Worker evidence remains available when the result cannot be decoded.
- Historical API request evidence remains readable, but the current application has no API-key provider. Codex requests retain attachment metadata/hashes; image bytes, credentials and private model reasoning remain excluded.
- `ExecutionLogExporter` creates a standalone Markdown document with the chronological journal, stage timeline, planning decisions, every stored attempt/prompt/review/reference selection, whole-set review history and configuration snapshot. It makes no provider calls.

The **Download execution log** action appears when a project is inactive (completed, paused or failed). The same document is included as `execution-log.md` in a successful production ZIP. JSON diagnostics remain available separately.

Historical projects retain their stored configuration. Missing original calls cannot be reconstructed: the export labels that limitation and includes their existing saved prompts/evidence. A resumed historical project records new calls under its run ID. A started request without a terminal entry has an unknown outcome; recording does not trigger an automatic retry.

Offline tests exercise concurrent calls, provider failure, state persistence/reopening, Codex subprocess evidence,  credential/binary redaction and legacy exports. No real image/model requests are required for verification.

Automatic deliveries include `qualityWarnings` and preserve failed/unknown reviews, compatibility approximations and deterministic reference fallbacks. The production ZIP includes `quality-warnings.json`; export availability does not imply that every artistic check passed.

Each new image attempt stores its numbered `generationInputManifest`, including source diagrams and the previous candidate used as an edit base. The UI resolves these IDs against the project profile snapshot and displays actual per-version reference images; planned slot candidates remain separate from final generation inputs.
