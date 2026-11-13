# Execution evidence and export

A project records append-only observable execution evidence in `execution.jsonl` inside its run directory. Provider work is scoped to that project; Codex worker folders are stored under `_jobs/`. Library maintenance and art-direction suggestions outside a project keep their separate job directories.

- `RunRepository` records granular before/after changes at persisted workflow checkpoints: concepts, category/pattern assignments, reference selection evidence, pilot gates, attempts, reviews, automatic corrections and user selections.
- `CodexRunner` records logical requests, exact worker instructions, schemas, attachment paths/hashes, tool events, structured results, usage and errors. Provider methods identify the responsible executor. Worker evidence remains available when the result cannot be decoded.
- `AuditedFetch` records actual OpenAI HTTP bodies and responses, with call IDs and durations. Authentication headers are never recorded. File inputs are represented by metadata and SHA-256; data-URL image inputs are hashed. Image response bytes and private model reasoning are excluded.
- `ExecutionLogExporter` creates a standalone Markdown document with the chronological journal, stage timeline, planning decisions, every stored attempt/prompt/review/reference selection, whole-set review history and configuration snapshot. It makes no provider calls.

The **Download execution log** action appears when a project is inactive (completed, paused or failed). The same document is included as `execution-log.md` in a successful production ZIP. JSON diagnostics remain available separately.

Historical projects retain their stored configuration. Missing original calls cannot be reconstructed: the export labels that limitation and includes their existing saved prompts/evidence. A resumed historical project records new calls under its run ID. A started request without a terminal entry has an unknown outcome; recording does not trigger an automatic retry.

Offline tests exercise concurrent calls, provider failure, state persistence/reopening, Codex subprocess evidence, OpenAI multipart upload logging, credential/binary redaction and legacy exports. No real image/model requests are required for verification.
