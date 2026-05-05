# Federated Routing

Mojulo-Lite bots already maintain a **per-bot tamper-evident chain**: every conversation turn stores a content hash and a chain hash that links to the previous turn. `/verify/:conversationId` walks the chain and reports whether the local SQLite has been tampered with.

Federated routing extends that chain across **triage handoffs**. When bot A routes a user to bot B, two things happen:

1. **Chain seeding.** Bot B's first turn descends from bot A's tip-of-chain, so the receiver's local chain is mathematically anchored to a specific value declared by the sender at handoff time.
2. **Handoff event recording.** Bot A writes a chained event row recording the routing transition, so its local chain captures *that* the user routed away (not just every chat turn before).

Together: a user's journey across multiple bots is cryptographically tamper-evident end-to-end, even though each bot keeps its own SQLite and never reads from the other.

---

## Architecture

```
Sender bot (deployment A)                 Receiver bot (deployment B)
  U_1 → U_2 → ... → A_n  ─── handoff ───►  B_1 → B_2 → ...
                     │                     ↑
                     │                     │ seed = A_n
                     ▼
                     H (handoff event row, chains past A_n)
```

- `A_n` is the sender's tip-of-chain at the moment the triage card is rendered.
- `B_1.chainHash = SHA256(B_1.contentHash + A_n)` — the receiver's first turn descends from the sender's tip.
- `H` is a chained event row on the sender, recording the click out. It extends the sender's chain *past* `A_n`, so the sender's record contains the routing transition. The receiver does not need to know about `H` — it anchored to `A_n` before `H` existed.

**Decoupled timing.** The URL carries `A_n` (already known when the triage card is rendered), while `H` is recorded asynchronously via `navigator.sendBeacon` on click. There is no synchronous round-trip during navigation.

---

## What gets passed in the handoff URL

The triage card the LLM produces becomes a link with these query params:

| Param            | Purpose                                                    |
|------------------|------------------------------------------------------------|
| `prompt`         | Auto-prefill for the receiver's first message              |
| `source`         | Sender's bot name (for analytics / user-visible attribution) |
| `conversationId` | Cross-bot correlation ID (UUID v4)                         |
| `chainHash`      | Sender's tip-of-chain (64-char lowercase hex SHA-256)      |

The receiver validates `conversationId` as a well-formed UUID v4 and `chainHash` as 64 lowercase hex chars before adopting either. Server-side validation is authoritative; client-side checks are fail-fast.

---

## Database schema

Two nullable columns on `turns`:

| Column        | Meaning                                                                                    |
|---------------|--------------------------------------------------------------------------------------------|
| `handoff_hash` | Sender's tip-of-chain at handoff time. Stored on the **first turn** of conversations seeded from a triage handoff. NULL otherwise (existing rows, native conversations). |
| `event_type`   | NULL for chat turns (existing semantics). `'handoff'` for triage click events recorded on the sender. |

Both are added via idempotent `ALTER TABLE` probes on startup, so existing deployments upgrade in place with no manual migration step. The `turns` table CREATE statement is unchanged for backward compatibility — handoff event rows store empty strings for `user_prompt` and `llm_response` (the schema's `NOT NULL` constraint on `user_prompt` predates this work, and SQLite cannot drop NOT NULL without a full table rebuild).

---

## Endpoints

### `POST /chat` — accepts handoff seed

Receives an optional `handoffHash` field in the request body. The seed is honored only when the local chain for that `conversationId` is empty; stale handoff hashes arriving on an already-extended chain are silently ignored.

When honored, the seed becomes the `previousChainHash` for that turn's chain hash computation, and the value is persisted on the row in `handoff_hash` for verify replay.

The response body now includes an explicit `chainHash` field alongside the existing `hashMsg` string, so the client can forward the tip-of-chain to the next bot without parsing.

### `POST /handoff` — records the click out

The sender records the triage click as a chained event row. Called by the client via `navigator.sendBeacon` immediately before navigation, so it survives the page unload without blocking the UX.

Request body:

```json
{
  "conversationId": "<uuid v4>",
  "deploymentId": "<receiver's deploymentId>",
  "starterPrompt": "<the prompt the LLM proposed>",
  "targetUrl": "<full URL the user is navigating to>"
}
```

The endpoint:

1. Validates `conversationId`. Rejects if no local conversation exists with that ID (prevents writing rootless chains from forged correlation IDs).
2. Picks the next monotonic turn number via `MAX(turn) + 1`.
3. Stores a row with `event_type = 'handoff'`, `user_prompt = ''`, `llm_response = ''`, and the structured payload (plus a server-side `timestamp`) JSON-serialized into `machine_state`.
4. Computes content hash and chain hash the same way chat turns do.

Rate-limited tighter than `/chat` (60 events / 15min per IP). Beacon traffic is fire-and-forget and abuse-attractive — forged conversation IDs would just write empty rows we can't verify against any sender, but the limiter caps the noise floor.

### `GET /verify/:conversationId` — unchanged shape

The verify endpoint returns the same `{ valid, totalTurns, invalidTurns, conversationsVerified }` shape as before. Chain math is uniform across chat turns and handoff events — the verifier walks the rows in turn order and recomputes each chain hash, falling back to the row's `handoff_hash` for the seed on the first turn (instead of a hardcoded `'0'`).

`GET /api/conversations/:conversationId` and the export endpoint expose `event_type` and `handoff_hash` per turn for any UI that wants to render handoff markers.

---

## Verify semantics

The first turn of a conversation seeds `prevHash` from:

1. The previous row in the same conversation (when there is one), OR
2. That row's stored `handoff_hash` (when this conversation was seeded from a triage handoff), OR
3. `null` (native conversation start).

Subsequent turns chain off the previous row in the conversation. Handoff event rows are part of the chain, not skipped — they hash and chain identically to chat turns; the only difference is `event_type = 'handoff'` and that the prompt/response columns are empty strings.

A successful verify means the local SQLite has not been tampered with **on this bot**. It does not, on its own, prove that the sender's tip-of-chain (`A_n`) was an authentic value at the time of handoff — the handoff hash arrives via a URL parameter that any party can write. Cross-bot continuity becomes a matter of independently fetching the sender's chain and confirming the values agree.

---

## What handoff events do *not* do

- **They don't gate routing.** If the beacon fails (network drop, browser kills it under unload, conversation has no local turns yet), the user is still routed correctly — the audit row is just missing. Worst case: one missing row in the sender's chain. Acceptable for current scope; if observed loss becomes non-trivial in production, retry-queue or sync-with-loading-state are the natural next steps.
- **They don't appear in LLM context.** `getConversationHistory` filters `WHERE event_type IS NULL` so handoff rows never surface as empty exchanges in the model's prompt window. Form-state continuity (`lastFormTracker` lookup on the previous chat turn) walks the same filtered history.
- **They don't inflate user-visible metrics.** `/api/conversation-metadata` totals filter handoff rows out of the message count.

---

## Trust model

What this system delivers:

- The sender's chain records every conversation event including routing transitions. A successful sender-side verify proves the sender's local SQLite is internally consistent, including the handoff event.
- The receiver's chain is mathematically anchored to a specific value declared by the sender at handoff time. A successful receiver-side verify proves the receiver's local SQLite is internally consistent and rooted at that declared seed.
- URL params (handoff hash, conversation ID) are public soft commitments — they are present in browser history, server access logs, and any analytics that capture URLs. That makes them witnessed by third parties beyond each bot's own DB.

What it does *not* deliver:

- The handoff hash in the URL is **forgeable**. Any party who knows the URL shape can stand up a fake sender and emit a chosen `chainHash`. The receiver has no built-in way to verify the seed came from the bot at the destination it claims.
- Each bot's `/verify/:id` only attests to that bot's portion. There is no built-in endpoint that proves chain continuity across the bot boundary.

For deployments where federated authenticity matters (and not just internal consistency), an external auditor can fetch each bot's `/api/conversations/:id` (which exposes `event_type` and `handoff_hash` per turn) and check that the receiver's first-turn `handoff_hash` matches the chain hash on the corresponding handoff event row in the sender's DB. The data plumbing is already in place for that kind of audit.

---

## Client behavior

On page load, the client reads `?conversationId=` and `?chainHash=` from the URL, validates both, and stores them. The chain hash is held as `pendingHandoffHash` and sent in the body of the next `/chat` call only — the server consumes it once and the client clears the pending value, so a stale handoff hash from a prior page load can't re-enter the chain on subsequent turns.

After every successful `/chat` response, the client updates its `currentChainHash` from the response body. When a triage card is rendered, the URL it builds appends `chainHash=<currentChainHash>` so the next bot in the chain can seed.

When the user clicks the triage card, the client fires a beacon to `POST /handoff` with the click metadata before letting the browser navigate. The beacon is best-effort; the navigation is not blocked on its delivery.

---

## File map

| File | Role |
|------|------|
| [lite-template/server.js](../lite-template/server.js) §schema | `ALTER TABLE` probes for `handoff_hash` and `event_type` |
| [lite-template/server.js](../lite-template/server.js) §`POST /chat` | Accepts and validates `handoffHash`, persists on first turn, exposes `chainHash` in response |
| [lite-template/server.js](../lite-template/server.js) §`POST /handoff` | Records triage click as chained handoff event row |
| [lite-template/server.js](../lite-template/server.js) §`verifyConversation` | Falls back to `handoff_hash` for first-turn `prevHash` |
| [lite-template/server.js](../lite-template/server.js) §`getConversationHistory` | Filters `event_type IS NULL` so handoff rows don't reach the LLM |
| [lite-template/client/index.html](../lite-template/client/index.html) §`createTriageCard` | Appends `chainHash` to handoff URL; fires `sendBeacon` to `/handoff` |
| [lite-template/client/index.html](../lite-template/client/index.html) §`getContext` | Adopts `?chainHash=` URL param into `pendingHandoffHash` |
| [lite-template/client/index.html](../lite-template/client/index.html) §`sendMessage` | Forwards `pendingHandoffHash` on next `/chat` then clears it |
