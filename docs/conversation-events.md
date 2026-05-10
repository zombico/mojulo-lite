# Conversation Events

A Mojulo-Lite bot's conversation history is stored as an **append-only typed event log**, not a chat-message table. Chat turns, optical-read extractions, and triage handoff events are all rows in the same `turns` table, in the same column shape, in the same chain. Every consumer — the LLM context window, the integrity verifier, the control-plane viewer, the JSON exporter — reconstructs the view it needs by replaying that one log forward and filtering by `event_type`.

This doc describes the event types currently emitted, what gets stored on each row, how the consumers replay differently, and where the system deliberately steps *outside* the event log.

---

## Why this shape

Three properties drive the design:

1. **One log, many views.** The runtime, the cryptographic verifier, and the operator dashboard all need conversation history but want different slices of it — the LLM doesn't want handoff noise, the verifier wants every row including handoffs, the dashboard wants both with type tags. A single typed log with consumer-side filtering is simpler than three parallel logs that have to stay in sync. Adding a new event kind is a new `event_type` value plus a replay branch in the consumers that care, never a new table.
2. **The event log IS the chain.** [Turn hashing](turn-hashing.md) covers every row in `turns` with the same hash function regardless of `event_type`. The integrity guarantee is "every event was written when claimed and hasn't been altered since" — not "every chat message." Handoffs and optical-read extractions are protected by the same primitive as chat turns; the verifier does not branch on row kind.
3. **Occurrence is in the log; sensitive payloads are not.** Form fills appear in the chain as a marker turn (`{<form_name>_filled}`), so the event of filling is tamper-evident. The submitted *values* live in a sibling [form_submissions](form-collection.md) table that the LLM never sees and the chain never covers. This split is deliberate — the chain attests to *what happened*, while PII isolation lives one layer down.

---

## Event types

Two `event_type` values currently appear in `turns`. Within `event_type IS NULL` (the chat-turn class), there are three row sub-shapes distinguished by what `user_prompt` contains.

| `event_type` | Sub-shape | Producer | `user_prompt` | `llm_response` | `machine_state` (JSON) |
|--------------|-----------|----------|---------------|----------------|------------------------|
| `NULL` | normal chat turn | `POST /chat` | The user's message | The LLM's response text | The full SATI envelope (`{answer, formTracker, suggestions, ...}`) |
| `NULL` | form-fill marker | `POST /chat` (sent by the client after `POST /api/submit-form`) | `{<form_name>_filled}` or `{<form_name>_skipped}` | The LLM's acknowledgement | SATI envelope; RAG is bypassed for this turn ([vector-rag.md](vector-rag.md)) |
| `NULL` | optical-read extraction | `POST /api/extract` | Sentinel `[optical_read image: <sha256(imageBytes)>]` | The LLM's response text | Envelope + `{extractedFields, source: 'optical_read', imageHash, imageMime, imageBytes, fileName}` |
| `'handoff'` | handoff event | `POST /handoff` | `''` | `''` | `{eventType: 'handoff', deploymentId, starterPrompt, targetUrl, timestamp}` |

Three details that aren't obvious from the table:

- **Optical-read sentinel.** `user_prompt` is set to `[optical_read image: <hash>]` so the chain locks over the source image bytes, not just the prose response. The actual prompt the model saw is preserved in the non-hashed `full_prompt` column for replay/debugging. See [optical-read.md](optical-read.md).
- **Optical-read submission.** When the user submits the edited extracted fields, that submission is itself a normal chat turn — no new event type. The diff between the extraction row and the submission row *is* the audit trail.
- **Handoff empty strings.** `user_prompt`/`llm_response` are stored as `''` because the legacy schema declared `user_prompt NOT NULL` before event rows were a thing, and SQLite cannot drop NOT NULL without rebuilding the table. The hash function takes those empty strings as input, so verification stays deterministic ([server.js](../lite-template/server.js)).

---

## Consumers and their replay shapes

The same ordered event log is read four ways. Each consumer orders by `turn ASC` and projects a different view:

### LLM context — `getConversationHistory()`

```sql
SELECT turn, user_prompt, llm_response
  FROM turns
 WHERE conversation_id = ?
   AND event_type IS NULL
 ORDER BY turn ASC
```

Handoff events are stripped — they have empty prompts and responses, so surfacing them as turns would inject empty exchanges into the model's context window. Form-fill markers and optical-read extractions are *not* stripped: the model is meant to see them. The protocol cartridges in [control/lib/composer/protocols/](../control/lib/composer/protocols/) tell it what `{<form_name>_filled}` and `[optical_read image: ...]` mean. See [protocol-composition.md](protocol-composition.md).

`machine_state` is consulted only as a fallback for `formTracker` recovery if JSON extraction fails on the next turn ([server.js](../lite-template/server.js)).

### Integrity verifier — `verifyConversation()`

```sql
SELECT id, turn, conversation_id, user_prompt, llm_response, machine_state,
       content_hash, chain_hash, handoff_hash, event_type
  FROM turns
 WHERE conversation_id = ?
 ORDER BY turn ASC
```

No `event_type` filter — every row is recomputed. The verifier hashes `(turn, user_prompt, llm_response, machine_state)` per row and re-links each `chain_hash` against the previous row's, with the first turn falling back to `handoff_hash` (cross-bot seed) or the literal sentinel `'0'` (native start). See [turn-hashing.md](turn-hashing.md) and [federated-routing.md](federated-routing.md).

### Control-plane viewer — `GET /api/conversations/:id`

Returns the full row set the verifier sees plus `timestamp` and `rag_context`, and attaches the `verification` object as a sibling field. The dashboard uses `event_type` to render handoff rows differently from chat rows, and uses the optical-read sentinel pattern in `user_prompt` to surface the extraction inline.

### Export — `GET /api/conversations/export`

Same shape, batched across conversations, field-renamed to camelCase on the way out (`user_prompt → userPrompt`, etc.). One JSON download per call.

---

## Chain coverage at a glance

What the per-bot tamper-evident chain covers, and what it doesn't:

| Data | Hashed into the chain? | Where it lives |
|------|------------------------|----------------|
| Chat turn prompt + response | Yes (`content_hash` over `user_prompt`, `llm_response`) | `turns` row |
| SATI envelope (`formTracker`, `suggestions`, etc.) | Yes (via `machine_state` as a string) | `turns.machine_state` |
| Optical-read source image | Yes — by sentinel: `user_prompt` is `[optical_read image: <sha256>]` | image bytes are not stored; only the hash is in the chain |
| Handoff target + starter prompt | Yes (via `machine_state`) | `turns.machine_state` |
| Form-fill *occurrence* | Yes — the chat turn carries `{<form_name>_filled}` | `turns.user_prompt` |
| Form-fill *contents* | **No** | `form_submissions.form_data` (sibling table, no chain) |
| RAG retrieval trace | **No** | `turns.rag_context` (column exists, not hashed) |
| Configuration (`config/*.json`) | **No** | Baked into the artifact at build time |

The form-fill split is the most subtle: a transcript proves *that* a user submitted form X at turn N, but proves nothing about *what* was inside. To produce evidence of submitted values, you join `turns` to `form_submissions` on `conversation_id` — neither side hashes the other, so that join is operational, not cryptographic.

The non-hashed columns (`rag_context`, `timestamp`, `id`) are present for operational use — provenance display in the dashboard, ordering, primary key. Including them in the chain would tie integrity to incidental concerns (e.g. which embedding-index revision served a chunk), so they sit outside it by design.

---

## Adding a new event type

Order of decisions, roughly:

1. **Pick an `event_type` value** — lowercase, snake_case (e.g. `'transfer'`, `'system_note'`).
2. **Define the four hashed columns.** Use sentinels in `user_prompt` / `llm_response` if the event has no human text — the verifier hashes whatever you write, so be specific. The optical-read pattern (`[optical_read image: <hash>]`) is the model to copy when the event references external bytes that should be tamper-evident.
3. **Decide LLM visibility.** Should the event appear in the model's context window or be stripped like handoffs are? If stripped, extend the `getConversationHistory()` filter from `event_type IS NULL` to `event_type IS NULL OR event_type IN (...)`. If visible, document the marker in the relevant protocol cartridge so the model knows how to interpret it.
4. **Decide chain extension semantics.** Most events should chain off the previous tip (the default). Cross-bot flows may instead seed a new chain from a remote tip — see [federated-routing.md](federated-routing.md) for the existing handoff pattern.
5. **Update the dashboard renderer** in the control plane so the new event type renders distinctly rather than appearing as a degenerate chat turn.

The current shape — chat turns visible, handoffs stripped, everything verified — is sufficient for the protocols that exist today. The extension points are designed so the next event type is additive, not a refactor.
