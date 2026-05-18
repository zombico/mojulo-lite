---
{
  "id": "document-extract-to-store",
  "name": "Optical extraction to durable store",
  "summary": "Persist optical-read extractions to a structured store (Notion/Airtable/Sheets rows) or a vector store (Pinecone/Qdrant/Chroma chunks), preserving traceability back to the source image and submission.",
  "valueHook": "Photos and screenshots the bot reads become queryable rows or searchable embeddings — extractions stop being one-shot.",
  "version": 1,
  "category": "extraction-pipeline",
  "requires": {
    "protocols": ["opticalRead"],
    "optionalProtocols": ["formGathering"],
    "destinationMcpCategory": "data-store-like",
    "destinationExamples": ["Notion", "Airtable", "Google Sheets", "Pinecone", "Qdrant"]
  },
  "parameters": [
    {
      "name": "destinationMode",
      "prompt": "Where should extracted fields land — a structured table (Notion/Airtable/Sheets, rows + columns), or a vector store (Pinecone/Qdrant/Chroma, chunks + embeddings)? If the user has only one of the two installed, pick that and confirm."
    },
    {
      "name": "recordKey",
      "prompt": "Which field uniquely identifies a record for dedupe? (typically a document number, claim id, policy id, or a hash of the extracted-field tuple when no natural key exists)"
    },
    {
      "name": "fieldMapping",
      "prompt": "How should the bot's extractedFields map to the destination? For table mode: field name → column name pairs. For vector mode: which fields are chunked, which become metadata filters?"
    },
    {
      "name": "imageRetention",
      "prompt": "Should the synthesized skill include a URL/path back to the original image in each record? (true/false — depends on whether the bot serves the image bytes long-term)",
      "default": false
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_conversation", "get_deployment"],
    "destination": {
      "description": "A data-store-like MCP. Two shapes are supported: (a) structured table MCPs (Notion, Airtable, Google Sheets, Coda) exposing row create/upsert with named columns; (b) vector store MCPs (Pinecone, Qdrant, Chroma, Weaviate) exposing embed + upsert with metadata. The synthesized skill commits to one shape per skill instance — write two skills if the user wants both."
    }
  }
}
---

# Optical extraction to durable store

The `opticalRead` protocol turns uploaded images (claim forms, IDs, lab results, receipts, contracts) into a structured `extractedFields` payload that gets attached to the submission. This catalyst takes that structured output and persists it to a long-term store where downstream systems — analytics, lookup tools, RAG corpora — can use it.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the optical-read configuration. The `extractedFields` schema (`idName`, `label`, `hint`) tells you exactly what fields each scan produces. **This is your source-of-truth for `fieldMapping`** — never invent fields the bot doesn't extract.
2. Ask the user the four `parameters` questions, batched. The `destinationMode` answer is the load-bearing branch — table mode and vector mode synthesize different skills.
3. Inspect the bound destination MCP. Confirm it matches `destinationMode` (a row-creation surface for table mode, an embed+upsert surface for vector mode). If the user has a vector store MCP but answered "table," ask — don't force-fit.
4. Write `.claude/skills/<bot-slug>-extract-to-<destination-slug>/SKILL.md`. The skill takes `deploymentId` and `since` as inputs.

## Mapping intent — table mode (Notion, Airtable, Sheets, Coda)

Each submission with an `extractedFields` payload becomes one row. Columns are derived from the `fieldMapping`:

- **Identity column** — the `recordKey` field. Used for upsert (search-before-create); this is the row's primary key from the destination's perspective.
- **Data columns** — one per extracted field. Map `idName` to the destination column. Preserve types: dates as dates, currency as numbers, strings as strings. Do not coerce everything to text.
- **Mojulo trace columns** — `mojulo_submission_id`, `mojulo_deployment_id`, `mojulo_captured_at`, optionally `mojulo_conversation_id`. Always include. The reviewer downstream needs to walk back to the source conversation when an extraction looks wrong.
- **Confidence/quality columns (optional)** — if the optical-read output carries per-field confidence, surface it. A column like `extraction_quality: 'high' | 'medium' | 'low'` lets the reviewer prioritize what to spot-check.

Field-to-column mapping that doesn't fit — extracted fields with no destination column — should prompt the user during synthesis, not be silently dropped. If the destination has a JSON/blob column, fall back to a `raw_extraction` JSON dump for unmapped fields; otherwise ask.

## Mapping intent — vector mode (Pinecone, Qdrant, Chroma, Weaviate)

Each submission with an `extractedFields` payload becomes one **or more** vector records. The chunking and metadata design is where vector mode earns its keep:

- **Chunking choice.** Two reasonable defaults: (a) one chunk per submission, concatenating `label: value` pairs into a single text string for embedding; (b) one chunk per extracted field, embedded as `<field label>: <value>` so semantic search can find documents matching a specific field pattern. Default to (a) unless the user's intent (per `fieldMapping`) names specific fields as standalone search targets.
- **Metadata.** Every chunk carries: `submission_id`, `deployment_id`, `captured_at`, `record_key` (the value of the `recordKey` field). Also any extracted field the user named as a metadata filter — these become the structured-filter dimensions for hybrid retrieval (e.g., `claim_year: 2026`).
- **Embedding choice.** The destination MCP usually exposes embedding internally (Pinecone has its own; Qdrant integrates with several). Use the destination's own embedding pipeline rather than re-embedding from Claude. If the destination requires pre-embedded vectors, the user has to provide an embedding tool (separate MCP or local helper) — this is the one case to ask before assuming.
- **Namespace / collection.** Default to per-deployment namespace (`mojulo_<deploymentId>`), so multiple bots writing to the same vector store don't pollute each other.

## Idempotency

**Both modes** use `since` as the primary high-water cursor on submission timestamp. Search-before-upsert on `recordKey` is the safety net for re-runs and duplicate submissions.

**Vector mode adds a wrinkle:** if `chunkStrategy` is "per-field" and the same submission is reprocessed, you get N chunks per submission and need to delete the prior N before re-upserting. Most vector MCPs expose a `delete-by-metadata` (filter on `submission_id`) — use it before upsert. The synthesized skill should make this explicit; silent N+N+N growth on re-runs is the most common bug here.

## Pitfalls

- **Extraction confidence is variable.** Optical-read is not perfect. Documents with low confidence shouldn't be auto-promoted to a system-of-record store. Recommend the synthesized skill default to a confidence threshold (e.g., skip-and-log when any required field is below `medium`), with the user opting into "include all" if they're staging for review.
- **PII in the destination.** Optical-read often captures sensitive fields (DOB, SSN, insurance ids, addresses). Tables and vector stores typically have broader access than the bot's own SQLite. Confirm with the user during synthesis which fields should be redacted, hashed, or excluded entirely before landing. Default to including everything the user says to include — but the question is non-skippable.
- **Vector store costs scale with rerun.** Vector upserts cost per-vector and per-embedding-call. A wide `since` window on first run can be expensive. Recommend starting with a 1-day window, validating the chunk shape, then widening.
- **Schema drift.** If the bot's `opticalRead` extraction fields change later (new field added, label renamed), the table schema or vector metadata schema will silently misalign. The synthesized skill should fail-loud on schema mismatch rather than silently dropping fields — and recommend the user re-run the catalyst flow when the bot's extraction config changes.
- **Image retention is a side concern.** If `imageRetention=true`, the URL/path included in each record only stays valid as long as the bot serves the image. If the bot rotates or deletes old uploads, the link breaks. Don't promise long-term access the bot doesn't deliver.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `since` (optional ISO, default 24h ago or last-cursor), `confidenceThreshold` (string, default `medium`), `dryRun` (default true)
- **Outputs:** per-submission decision log: `{ submissionId, recordKey, action: 'inserted' | 'updated' | 'skipped-low-confidence' | 'skipped-duplicate' | 'failed', destinationRecordId?, chunkCount? }`. Vector mode adds `chunkCount` per record.
- **Side effects (live mode):** row create/upsert (table mode) or chunk delete+upsert (vector mode) via destination MCP. No mojulo-side writes.
