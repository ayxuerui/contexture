## Capturing and ingesting new material

Capture new material as a file in `__INBOX_PATH__`. Everything under `__CAPTURE_ROOT__` is tracked in git as provenance but excluded from retrieval — nothing there is a note. A capture may carry `source_type` and `source_id`; it must never carry `source_hash` or `ingested`, which `ctxr ingest` assigns once. `ctxr-capture` carries the capture procedure and `ctxr-ingest-orchestration` the dedupe check and the ingest; the note a capture informs carries no source identity of its own.
