# Turn Hashing

Every conversation turn Mojulo-Lite persists is **content-hashed** and **chain-linked** to the previous turn. The result is a per-bot tamper-evident transcript: any after-the-fact edit to a stored row breaks the chain at that row and every row after it, and `GET /verify/:conversationId` walks the chain and reports the break.

This doc describes the single-bot chain — how each row's hashes are computed, what gets stored, and what verify proves. The cross-bot extension (chains that survive triage handoffs) is in [federated-routing.md](federated-routing.md).

---

## Why this shape

Three properties drive the design:

1. **Local-only, no keys.** Hashing runs entirely inside the bot process with the Node `crypto` module — no signing key, no HSM, no external timestamp authority. The chain attests to *internal consistency*, not authenticity. That's enough for the threat model: an operator who later edits a row to rewrite history cannot do so without leaving the chain broken at every subsequent turn.
2. **Plain SHA-256, no Merkle tree, no append-only log library.** A linked hash chain is the minimum primitive that catches retroactive edits. A tree or external WAL would buy properties (efficient inclusion proofs, crash-safety guarantees) the bot doesn't need — SQLite's own durability already covers crash safety.
3. **Same shape for every row.** Chat turns and handoff event rows hash identically. The verifier walks rows in turn order and recomputes; it does not branch on row kind. New event types added later only need to populate the same four hashed fields.

---

## How a turn is hashed

Two hashes are computed per row at write time, both SHA-256 hex digests (64 lowercase hex chars):

### Content hash

A digest of the turn's payload — what was said, by whom, on which turn, with what machine state attached:

```js
function hashTurnContent(turn, userPrompt, llmResponse, machineState) {
    const content = JSON.stringify({
        turn,
        userPrompt,
        llmResponse,
        machineState
    });
    return crypto.createHash('sha256').update(content).digest('hex');
}
```

The hash covers the four fields stored on the row. `machineState` is a JSON string (the assembled SATI response or, for handoff events, a small structured payload), so it's hashed as a string — re-serializing the parsed object would shift key order on some runtimes and break verify.

### Chain hash

The link to the previous row in the same conversation:

```js
function createChainHash(contentHash, previousChainHash) {
    const combined = contentHash + (previousChainHash || '0');
    return crypto.createHash('sha256').update(combined).digest('hex');
}
```

`previousChainHash` is the prior row's `chain_hash` for normal turns. For the first turn of a conversation, it falls back to the literal sentinel string `'0'`, unless the conversation was seeded by a triage handoff — in which case the sender's tip-of-chain takes that slot (see [federated-routing.md](federated-routing.md)).

### Why two hashes and not one

Storing both lets the verifier independently check that the *content* is unchanged and that the *position in the chain* is unchanged. A single combined hash would conflate the two: an operator who edits `llm_response` on row 5 could in principle recompute every chain hash from row 5 forward and pass verify. Storing `content_hash` separately means verify recomputes it from the row's columns — so a content edit shows up regardless of whether the operator also rewrote the chain.

---

## Database schema

The hashes live on the `turns` table alongside the row they cover:

| Column         | Type | Meaning                                                                |
|----------------|------|------------------------------------------------------------------------|
| `content_hash` | TEXT NOT NULL | SHA-256 of `{turn, userPrompt, llmResponse, machineState}`    |
| `chain_hash`   | TEXT NOT NULL | SHA-256 of `contentHash + previousChainHash` (or `'0'` for the first row of a native conversation) |

Both columns are part of the original `CREATE TABLE` and exist on every row written by the bot — there is no nullable case for chat turns or handoff events. (The federated-routing extension adds a third nullable column, `handoff_hash`, for the seed value when a conversation was started by a triage handoff. That's described in [federated-routing.md](federated-routing.md).)

---

## When hashes get written

### `POST /chat` — every chat turn

After the LLM call returns and the response payload is assembled, the server computes `contentHash` from the new turn's fields, looks up the previous row's `chain_hash` for this conversation, computes `chainHash`, and persists the row in a single insert. The chain hash is also returned in the response body as `chainHash` (and as the legacy `hashMsg` string for the existing log UI), so the client can forward it to a downstream bot via a triage handoff URL.

### `POST /handoff` — triage click event

Recorded on the *sender* when the user clicks a triage card. Hashes are computed identically: the same `hashTurnContent` and `createChainHash` functions, with `userPrompt = ''`, `llmResponse = ''`, and the click metadata JSON-serialized into `machineState`. The chain extends past the last chat turn — the chain math does not branch on `event_type`. See [federated-routing.md](federated-routing.md) for the full handoff event flow.

### `POST /api/extract` — Optical Read extraction turn

Recorded as a regular chat-shaped row (no `event_type`) but with the user's image bytes baked into the hash. The `user_prompt` column stores the sentinel `[optical_read image: <sha256(imageBytes)>]`; the natural-language prompt the model saw lives in `full_prompt`. `machine_state` carries the structured response plus `source: 'optical_read'`, `imageHash`, `imageMime`, `imageBytes`, and `fileName`. Verify hashes the sentinel value as-is — the chain therefore breaks if the stored image hash is altered, even when the prose response is unchanged. The submission step that follows (`/api/submit-form` with `metadata.source: 'optical_read'`) extends the chain through the existing `form_submissions` write; the diff between Turn 1 (extraction) and Turn 2 (submission) is the audit trail. See [optical-read.md](optical-read.md).

---

## Verify

### `GET /verify` and `GET /verify/:conversationId`

The verifier reads rows in `turn` order (scoped to one conversation, or grouped by conversation when called without an ID) and replays the chain:

1. **Recompute content hash.** Re-hash the row's `(turn, user_prompt, llm_response, machine_state)` and compare against the stored `content_hash`. A mismatch means the row's columns were edited after it was written.
2. **Recompute chain hash.** Compute `SHA256(content_hash + prevHash)` where `prevHash` is the *previous row's stored* `chain_hash` (or the seed for the first turn — `'0'`, or the row's `handoff_hash` if it was seeded from a handoff). Compare against the stored `chain_hash`. A mismatch means either this row's link was tampered with, or a prior row in the chain was edited and the operator did not propagate the recompute forward.

Response shape:

```json
{
  "valid": true,
  "totalTurns": 42,
  "invalidTurns": 0,
  "conversationsVerified": 1
}
```

`invalidTurns` counts rows that fail either check. The endpoint is unauthenticated and read-only — it's safe to expose to operators or to embed in a status UI.

### What a passing verify proves

- Every row's payload (`user_prompt`, `llm_response`, `machine_state`) matches the value present when the row was first written.
- The order of rows is unchanged: no row was inserted, deleted, or reordered after the fact.
- The conversation's first turn descends from the declared seed (`'0'` for native conversations, the sender's tip-of-chain for handoff-seeded conversations).

### What it does not prove

- **No external authenticity.** There is no signing key, so an operator who controls the bot can rebuild the entire chain from scratch with any payload they want, and verify will pass. The chain only catches *retroactive* edits, not coordinated history rewrites done before any third party reads `/verify`.
- **No timestamp guarantee.** `timestamp` is a `DEFAULT CURRENT_TIMESTAMP` column and is *not* part of the hashed content. An operator can edit timestamps without breaking verify. (This is deliberate — clock skew and DST changes would otherwise produce false invalidations.)
- **No cross-bot continuity, on its own.** Each bot's verify only attests to that bot's portion. Cross-bot tamper-evidence requires the federated-routing extension below.

### Stronger guarantees, not shipped

For threat models where the bot operator themselves is in scope — coordinated forgery, not just naive retroactive edits — the standard fix is to externalize chain tips to a record the operator cannot rewrite after the fact. Three patterns recognized in this space:

- **RFC 3161 timestamping** — the bot posts each chain tip (or a batched Merkle root) to a Time-Stamp Authority, which signs `(hash, time)` with its own key. Strongest single-jump guarantee; requires per-turn or per-batch outbound network, and breaks the offline-build story unless batching is deferred.
- **OpenTimestamps (Bitcoin anchoring)** — batch chain tips into a Merkle root and post to a public aggregator; once the next Bitcoin block is mined, the timestamp is unforgeable without rewriting the public chain. Free, async, no key trust. Verify gets stronger over time as the anchor matures.
- **External witness server** — POST `{conversation_id, turn, chain_hash, ts}` to a configured endpoint (control plane, regulator, customer's compliance webhook). Trust shifts from a TSA to whoever runs the witness; simplest fit for self-hosted deployments.

None of these are implemented today. The federated-routing handoff is the existing externalization surface in the codebase — generalizing it into a pluggable witness sink is the natural extension point. The bare hash chain documented above is the minimum primitive; everything beyond it depends on which external anchor your threat model accepts.

---

## Cross-bot continuity

When a user is routed from one bot to another via a triage card, the chain extends across the bot boundary: the receiver's first turn descends from the sender's tip-of-chain, and the sender records the routing transition as a chained handoff event row. None of that mechanism is covered here — for the URL contract, the handoff event row, the `handoff_hash` column, the trust model across bots, and the audit path an external observer can use to confirm cross-bot continuity, see [federated-routing.md](federated-routing.md).

---

## File map

| File | Role |
|------|------|
| [lite-template/server.js](../lite-template/server.js) §schema | `turns` table CREATE with `content_hash` / `chain_hash NOT NULL` |
| [lite-template/server.js](../lite-template/server.js) §`hashTurnContent` | SHA-256 over `JSON.stringify({turn, userPrompt, llmResponse, machineState})` |
| [lite-template/server.js](../lite-template/server.js) §`createChainHash` | SHA-256 of `contentHash + previousChainHash` (seed `'0'` when null) |
| [lite-template/server.js](../lite-template/server.js) §`getLastChainHash` | Reads the previous row's `chain_hash` to use as the link target |
| [lite-template/server.js](../lite-template/server.js) §`POST /chat` | Computes both hashes per turn, persists them, returns `chainHash` in the response |
| [lite-template/server.js](../lite-template/server.js) §`verifyConversation` | Walks rows in turn order, recomputes both hashes, returns `{ valid, totalTurns, invalidTurns, conversationsVerified }` |
| [lite-template/server.js](../lite-template/server.js) §`GET /verify`, `GET /verify/:conversationId` | Public read-only verify endpoints |
| [lite-template/client/index.html](../lite-template/client/index.html) §`sendMessage` | Surfaces `hashMsg` in the log UI, tracks `currentChainHash` for downstream handoffs |
