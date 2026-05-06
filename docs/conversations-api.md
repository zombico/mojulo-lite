# Conversations API (Connect Bot)

Once a Mojulo-Lite bot is running anywhere reachable — `localhost:3000`, an ngrok tunnel, a LAN host, a Fly app, a VPS — the operator can **connect** it to the control plane by pasting its URL on the deployment row. The dashboard then proxies through to the bot's read-only endpoints to browse conversations and form submissions, **without ever copying conversation data into the control-plane DB**.

This doc describes how that connection is established, how the proxy works, and what each proxied route does.

---

## Why this shape

Three properties drive the design:

1. **The bot's data stays on the bot.** Conversation rows live solely in the artifact's SQLite. The control plane only stores `url` + `last_seen_at` per deployment row — disconnecting or moving the bot doesn't migrate or duplicate user data. There is no "sync" mechanism to break.
2. **No new credential to copy-paste.** At build time, the deployment row's `api_key` is written into the artifact's `.env` as `MOJULO_API_KEY`. Both sides already share the secret. Connecting is a one-field UX (URL only) — the proxy authenticates by attaching the row's `api_key` as `x-mojulo-api-key` to every forwarded request.
3. **The proxy is a thin shim.** Each control-plane route does one thing: validate the deployment row → check `url` is set → forward → touch `last_seen_at` → relay the body. No request rewriting, no caching, no result transformation beyond stamping `botName` onto a couple of response shapes for UI convenience.

---

## Trust model

| Where the secret lives | When it gets there | Who sees it |
|---|---|---|
| `deployments.api_key` (control-plane DB) | Generated when the deployment row is created | Control plane |
| `MOJULO_API_KEY` in the artifact's `.env` | Baked in at build time by [DockerDeployer](../control/lib/deployers/docker.js) | The bot's process |

The operator **never** copies the key. They only paste the bot's URL. Both sides agreeing on the key from build time is what makes connect a single-field action.

The bot validates `x-mojulo-api-key` via [middleware/auth.js](../lite-template/middleware/auth.js): exact-string compare against `process.env.MOJULO_API_KEY`. Mismatch → 401. Missing header → 401. Every protected `/api/*` route on the bot gates through this middleware.

---

## Connecting

```
 Operator                Control Plane                       Bot
   │                          │                                │
   │  Paste URL in            │                                │
   │  ConnectModal            │                                │
   ├─────────────────────────▶│                                │
   │                          │ POST /api/deployments/:id/     │
   │                          │      connection { url }        │
   │                          │                                │
   │                          │ normalizeBotUrl(url)           │
   │                          │  → strip trailing /, validate  │
   │                          │    http(s) + hostname          │
   │                          │                                │
   │                          │ probeBotConnection(            │
   │                          │   normalizedUrl,               │
   │                          │   deployment.apiKey            │
   │                          │ )                              │
   │                          │                                │
   │                          │  GET /api/conversations        │
   │                          │  x-mojulo-api-key: <apiKey>    │
   │                          │  (5s timeout)                  │
   │                          ├───────────────────────────────▶│
   │                          │                                │ validateApiKey
   │                          │◀───────────────────────────────┤ 200 OK { count }
   │                          │                                │  (or 401, 5xx, ...)
   │                          │                                │
   │                          │ on probe.ok →                  │
   │                          │   DeploymentRepository         │
   │                          │     .setUrl(id, url)           │
   │                          │   (writes deployments.url +    │
   │                          │    last_seen_at = now)         │
   │                          │                                │
   │  ConnectModal closes     │ 200 { id, url, lastSeenAt }    │
   │  Status pill turns green │                                │
   │◀─────────────────────────┤                                │
```

**The probe hits `GET /api/conversations` with no query params** ([bot-proxy.js:51-72](../control/lib/deployers/bot-proxy.js#L51-L72)). This is deliberate — that route returns `200 OK` with a `total` count even when no search params are provided (see "guardrail" below). A successful probe response simultaneously validates:

- The URL is reachable (network).
- The bot is alive (200 from Express).
- The shared secret matches (didn't get 401).

A failing probe maps the failure mode into a human-readable message:

| `probe.reason`   | UI message                                                                 |
|------------------|----------------------------------------------------------------------------|
| `unauthorized`   | "Bot rejected the API key. Make sure MOJULO_API_KEY in the bot matches…"   |
| `timeout`        | "Probe timed out. Check the URL and that the bot is running."              |
| `network`        | "Could not reach \<url\> (\<error\>)."                                     |
| `bad_status`     | "Bot returned status \<n\>."                                               |

All probe failures return HTTP 502 from the connection endpoint — the URL is **not** persisted on a failed probe.

**URL normalization** ([bot-proxy.js:13-26](../control/lib/deployers/bot-proxy.js#L13-L26)) accepts http(s) only, strips trailing slashes, drops a bare `/` pathname (so `https://bot.example/` and `https://bot.example` are equivalent). Anything else returns `null` and the connection endpoint fails with 400 before the probe is even attempted.

---

## Disconnecting

`DELETE /api/deployments/:id/connection` clears `url` and `last_seen_at` ([connection/route.js:46-53](../control/app/api/deployments/[id]/connection/route.js#L46-L53)). Three things stay untouched:

- The deployment row itself (and its `api_key`).
- The bot process (it doesn't even know it was disconnected).
- The bot's SQLite (conversations are not deleted, exported, or transferred).

Reconnecting later — same URL, different URL, doesn't matter — re-runs the probe and re-stamps `url` + `last_seen_at`. Disconnect is purely a control-plane forget.

---

## Reachability & freshness

`deployments.last_seen_at` is updated on every successful proxied call (`touchLastSeen` runs after each route's bot fetch resolves). The dashboard renders this as a freshness signal:

| Condition                                     | Status pill              |
|-----------------------------------------------|--------------------------|
| `status = 'ready'`, has `url`, `last_seen_at` < 5 min ago | **green** "Running"      |
| `status = 'ready'`, has `url`, `last_seen_at` ≥ 5 min ago | **amber** "Running · stale" |
| `status = 'ready'`, no `url`                  | **teal** "Ready"         |

The 5-minute threshold lives in the dashboard ([dashboard/page.jsx](../control/app/dashboard/page.jsx#L10)) — it's a UI heuristic, not a server-side TTL. Nothing actually breaks at 5min + 1s; the dot just goes amber until the next proxied call refreshes `last_seen_at`.

If the bot becomes unreachable mid-session, the proxy returns 502 and the conversations page surfaces an "unreachable" banner with the underlying reason.

---

## Proxied routes

Every route below shares the same skeleton:

1. Look up the deployment row. **404** if missing.
2. Reject with **409** if `url` is not set ("Bot is not connected").
3. Forward to the bot via `fetchFromBot(deployment, path, opts)`.
4. On a fetch exception, return **502** with the underlying reason (`timeout`, `network`, etc.).
5. On a non-2xx bot response, return **502** with `{ status, body: <truncated> }` (single-conversation maps a bot 404 to a proxy 404; everything else is 502).
6. On success: `touchLastSeen` → relay JSON or stream body.

| Control-plane route | Forwards to | Notes |
|---|---|---|
| `GET /api/deployments/:id/conversations?…` | `GET /api/conversations?…` | Query string passes through verbatim. Response is decorated with `botName` for the UI header. |
| `GET /api/deployments/:id/conversations/:conversationId` | `GET /api/conversations/:conversationId` | Bot's 404 maps to proxy 404; others stay 502. Body relays unchanged (includes `event_type` and `handoff_hash` per turn). |
| `GET /api/deployments/:id/conversations/export?…` | `GET /api/conversations/export?…` | Streams `response.body` directly. Adds `content-disposition: attachment; filename="conversations-<botName>-<YYYY-MM-DD>.json"`. **60s timeout** (vs the default 30s) for large dumps. |
| `GET /api/deployments/:id/submissions?…` | `GET /api/forms?…` | Form submissions list. Same `botName` decoration. |
| `GET /api/deployments/:id/submissions/export?…` | `GET /api/forms/export?…` | CSV stream with UTF-8 BOM (so Excel renders CJK / Thai / Arabic field values correctly). |
| `GET /api/deployments/:id/storage` | `GET /api/storage` | Volume + database size + conversation/turn counts. Used by the Storage card on the deployment detail page. |

---

## Bot-side endpoints (what the proxy talks to)

All gated by [validateApiKey](../lite-template/middleware/auth.js).

### `GET /api/conversations` (list)

Query params:
- `conversationId` — substring match on `conversation_id` (uses `LIKE %…%`).
- `startDate`, `endDate` — ISO timestamps; filter on `MIN(timestamp)` per conversation.
- `limit` (default 50), `offset` (default 0).

**Guardrail:** if **none** of `conversationId` / `startDate` / `endDate` are provided, the route returns `{ conversations: [], pagination: { total: <count>, returned: 0 } }` — no rows. This prevents an accidental full-table dump for bots with thousands of conversations and is also what makes `GET /api/conversations` a cheap reachability probe.

When at least one filter is present:

```json
{
  "conversations": [
    {
      "conversation_id": "…",
      "started_at": "…",
      "last_activity": "…",
      "turn_count": 12,
      "max_turn": 13
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 184,
    "returned": 50,
    "hasMore": true,
    "nextOffset": 50
  }
}
```

### `GET /api/conversations/:conversationId`

Full turn list for one conversation, plus the chain-verify result for that conversation. Each turn includes `user_prompt`, `llm_response`, `machine_state`, `rag_context`, `content_hash`, `chain_hash`, `event_type`, `handoff_hash`. Returns 404 if no rows match.

### `GET /api/conversations/export`

Bulk export of all conversations matching `startDate` / `endDate`. Returns a JSON document with one entry per conversation, full turn history nested under each. The control-plane proxy streams the body through with a `content-disposition` attachment header — the browser saves it as a download.

### `GET /api/forms` and `GET /api/forms/export`

Form submissions list and CSV export ([server.js:1085-1178](../lite-template/server.js#L1085-L1178)). The CSV's column order is stable: it follows the bot's `formStructure.json` field IDs, then any extra keys that appear in the data. UTF-8 BOM prepended so Excel renders non-Latin field values correctly.

### `GET /api/storage`

Volume disk usage + SQLite file size + conversation/turn counts. No PII in this response — useful for the Storage card without proxying any conversation data.

---

## How `fetchFromBot` works

The whole proxy is one helper:

```js
fetchFromBot(deployment, path, { method, timeoutMs })
```

- Throws if `deployment.url` is unset (the route handlers check beforehand, so this is a defensive belt-and-braces).
- Builds `${deployment.url}${path}`.
- Sets `x-mojulo-api-key: ${deployment.apiKey}`.
- Wraps in an `AbortController` with `timeoutMs` (default 30 000 ms; 60 000 for the export endpoint).
- Returns the raw `Response`.

Route handlers decide what to do with that response — `await response.json()` for JSON, `new Response(response.body)` for streaming, etc. This split is intentional: the helper stays uniform; per-route handlers handle response semantics (filenames, status mapping, body decoration).

---

## What Connect Bot guarantees

- **Stateless proxy.** Every dashboard view re-fetches from the bot — no server-side cache, no shadow copy of conversations. Your data stays on your bot; disconnecting never duplicates user data anywhere. SWR handles client-side caching for snappy UI.
- **Single-field connect.** The shared secret is baked in at build time, so the operator only ever pastes a URL. One field, one click, one connection.
- **Read-only by design.** All proxied routes are `GET`. Disconnect is a control-plane forget — the bot keeps running, unaware. Rebuild the artifact and the existing connection still works, because the deployment row's `api_key` survives until you explicitly rotate it.

---

## File map

| File | Role |
|------|------|
| [control/lib/deployers/bot-proxy.js](../control/lib/deployers/bot-proxy.js) | `normalizeBotUrl`, `probeBotConnection`, `fetchFromBot` — the entire proxy primitive set |
| [control/app/api/deployments/[id]/connection/route.js](../control/app/api/deployments/[id]/connection/route.js) | `POST` (probe + save URL), `DELETE` (forget URL) |
| [control/app/api/deployments/[id]/conversations/route.js](../control/app/api/deployments/[id]/conversations/route.js) | List proxy (filtered + paginated) |
| [control/app/api/deployments/[id]/conversations/[conversationId]/route.js](../control/app/api/deployments/[id]/conversations/[conversationId]/route.js) | Single-conversation proxy (404 passthrough) |
| [control/app/api/deployments/[id]/conversations/export/route.js](../control/app/api/deployments/[id]/conversations/export/route.js) | Bulk export passthrough (60s timeout, streams body) |
| [control/app/api/deployments/[id]/submissions/route.js](../control/app/api/deployments/[id]/submissions/route.js) | Form submissions list proxy |
| [control/app/api/deployments/[id]/submissions/export/route.js](../control/app/api/deployments/[id]/submissions/export/route.js) | CSV export proxy |
| [control/app/api/deployments/[id]/storage/route.js](../control/app/api/deployments/[id]/storage/route.js) | Storage stats proxy |
| [control/lib/db/repositories/deployments.js](../control/lib/db/repositories/deployments.js) | `setUrl`, `clearUrl`, `touchLastSeen` |
| [control/app/dashboard/page.jsx](../control/app/dashboard/page.jsx) | `ConnectModal` UI + `STALE_THRESHOLD_MS = 5 min` heuristic + status pill rendering |
| [control/app/dashboard/deployments/[id]/conversations/page.jsx](../control/app/dashboard/deployments/[id]/conversations/page.jsx) | Conversations browser that consumes the proxy |
| [lite-template/middleware/auth.js](../lite-template/middleware/auth.js) | `validateApiKey` — the `x-mojulo-api-key` guard the proxy passes through |
| [lite-template/server.js](../lite-template/server.js) `/api/conversations`, `/api/conversations/:id`, `/api/conversations/export`, `/api/forms`, `/api/forms/export`, `/api/storage` | Bot-side endpoints |
| [lite-template/server.js](../lite-template/server.js) §`/api/conversations` guardrail | Returns 0 rows + total count when no filters provided (also makes the route a cheap reachability probe) |
