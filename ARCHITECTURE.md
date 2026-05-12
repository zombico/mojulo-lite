# Mojulo Lite: Compiled Artifact Architecture

Mojulo Lite produces a **portable, self-contained Docker bot** packaged as a downloadable ZIP. Unlike the main Mojulo control plane (which deploys bots to a managed Kubernetes cluster), Mojulo Lite hands the user a ready-to-run artifact they can launch anywhere Docker runs.

---

## 1. Build-Time: Control Plane → Artifact

The control plane's [DockerDeployer](control/lib/deployers/docker.js) assembles the artifact from the [lite-template/](lite-template/) source plus user-supplied config.

```
                     ┌──────────────────────────────────────┐
                     │    Mojulo Lite Control Plane         │
                     │         (Next.js app)                │
                     │                                      │
                     │  User configures bot in wizard:      │
                     │  - LLM provider + model              │
                     │  - Uploaded documents                │
                     │  - Enabled protocols                 │
                     │  - Identity (name, first message)    │
                     └──────────────┬───────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────┐
                     │  POST /api/deploy                    │
                     │  → DockerDeployer.deploy()           │
                     │    (control/lib/deployers/docker.js) │
                     └──────────────┬───────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
  ┌──────────────┐           ┌──────────────┐           ┌──────────────────┐
  │ Copy template│           │  Compose     │           │ Bake vector index│
  │ (config-only │           │ instructions │           │                  │
  │  in prebuilt │           │              │           │ chunkDocuments + │
  │  mode — full │           │ composer.js  │           │ chunkTriageRoutes│
  │  source only │           │ merges:      │           │  → e5-small      │
  │  in offline  │           │ - 00_base    │           │  embeddings      │
  │  build mode) │           │ - 01_knowledge│          │  → embeddings.json│
  │              │           │ - 02_forms   │           │ (built upstream  │
  │              │           │ - 03_appts   │           │  by /api/vectorize│
  │              │           │ - 04_triage  │           │  -rag; copied in │
  │              │           │ - 05_optical │           │  here)           │
  │              │           │   _read      │           │                  │
  └──────┬───────┘           └──────┬───────┘           └──────┬───────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    ▼
                     ┌──────────────────────────────────────┐
                     │  Write generated files:              │
                     │  - config/config.json (identity,LLM) │
                     │  - config/instructions.txt           │
                     │  - config/embeddings.json (if any    │
                     │     knowledge or triage routes)      │
                     │  - config/formFormat.json            │
                     │  - config/calendarConfig.json        │
                     │  - config/triageRoutes.json          │
                     │  - docker-compose.yml (pulls         │
                     │     ghcr.io/zombico/mojulo-bot:X)    │
                     │  - .env.example + .env (admin key)   │
                     │  - README.md                         │
                     └──────────────┬───────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────┐
                     │     {botName}-{deploymentId}.zip     │
                     │     ← download URL returned to user  │
                     └──────────────────────────────────────┘
```

Key build steps live in [control/lib/deployers/docker.js:259-393](control/lib/deployers/docker.js#L259-L393).

**Two build modes:**

- **Prebuilt-image mode (default).** The artifact ships only config + docker-compose; the bot image (`ghcr.io/zombico/mojulo-bot:X`) is pulled at `docker compose up`. Source, Dockerfile, `helper/`, `models/`, and `node_modules` are stripped from the ZIP — see `PREBUILT_EXCLUDES` in [docker.js:41-54](control/lib/deployers/docker.js#L41-L54).
- **Offline-build mode** (`MOJULO_OFFLINE_BUILD=1`). The artifact bundles full source + Dockerfile so `docker compose up --build` works without ghcr.io reachability. Slower first run, no registry dependency.

**Vector index baking.** Knowledge documents and triage routes are chunked together by [chunker.js](control/lib/embedder/chunker.js) and embedded via the local multilingual-e5-small ONNX model in [/api/vectorize-rag](control/app/api/vectorize-rag/route.js). The resulting `embeddings.json` blob is stored once in the control plane's storage layer, then copied bit-for-bit into the artifact at build time. Triage route descriptions live in the same cosine index as document chunks, distinguished by `metadata.source === 'triage-route'`.

---

## 2. Artifact Layout (the ZIP)

What the user gets when they unzip (prebuilt-image mode — default):

```
{botName}-{deploymentId}/
├── docker-compose.yml        ← Pulls ghcr.io/zombico/mojulo-bot:X, exposes :3000,
│                                mounts ./data ./config ./documents
├── .env                      ← Pre-filled admin API key; user adds LLM key
├── .env.example              ← Hints for all supported providers
├── README.md                 ← One-command launch instructions
│
├── config/                   ← Baked at build time — the only per-bot state
│   ├── config.json           ← Bot identity + LLM provider/model + rag.embeddingsPath
│   ├── instructions.txt      ← Composed protocol cartridges
│   ├── embeddings.json       ← {model, chunks:[{text,embedding,metadata,...}]}
│   │                           — chunks include both document chunks AND triage-route
│   │                           descriptions (metadata.source distinguishes them).
│   │                           Absent if neither knowledge nor triage are enabled.
│   ├── formFormat.json       ← (if forms enabled)
│   ├── calendarConfig.json   ← (if appointments enabled)
│   └── triageRoutes.json     ← (if triage enabled — authoritative deploymentId list)
│
└── data/                     ← Created at runtime (SQLite lives here)
    └── conversation.db       ← turns + content/chain hashes + form_submissions
```

The bot image (`ghcr.io/zombico/mojulo-bot:X`) bakes in:

- `Dockerfile` — Debian slim Node 20 + native deps (better-sqlite3, onnxruntime-node).
- `server.js`, `package.json`, `client/`, `middleware/`, `integration/`.
- `helper/` — `llm-client.js` (6-provider abstraction), `vector-rag.js` (cosine over baked embeddings.json), `embedder-local.js` (multilingual-e5-small ONNX, in-process query embedding), `prompt-assembler.js`, `form-submission.js`.
- `models/Xenova/multilingual-e5-small/` — q8 ONNX + tokenizer (~113MB, fetched by `scripts/fetch-embed-model.mjs` during the GHCR build).

In **offline-build mode** (`MOJULO_OFFLINE_BUILD=1`) all of the above ship inside the ZIP and `docker-compose.yml` builds locally from the bundled Dockerfile.

---

## 3. Runtime: `docker compose up`

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Host                                  │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │              Docker Container (mojulo/bot:local)            │    │
│   │                                                             │    │
│   │  ┌────────────────────────────────────────────────────┐    │    │
│   │  │              server.js (Express, :3000)            │    │    │
│   │  │                                                     │    │    │
│   │  │  Startup (server.js:~1340-1420):                   │    │    │
│   │  │    1. Load config/config.json                      │    │    │
│   │  │    2. Merge env vars (LLM_PROVIDER, *_API_KEY)     │    │    │
│   │  │    3. Init LLM client (llm-client.js)              │    │    │
│   │  │    4. Cache instructions.txt                       │    │    │
│   │  │    5. Init VectorRAG from config/embeddings.json   │    │    │
│   │  │       (warms embedder-local.js → ONNX into memory).│    │    │
│   │  │       Missing file → RAG silently disabled.        │    │    │
│   │  │    6. Open SQLite (data/conversation.db)           │    │    │
│   │  │                                                     │    │    │
│   │  └────────────────────────────────────────────────────┘    │    │
│   │                                                             │    │
│   │  Endpoints:                                                 │    │
│   │   GET  /              → serves client/ with injected config│    │
│   │   POST /chat          → main conversation (rate-limited)   │    │
│   │   POST /handoff       → triage click → chained event row   │    │
│   │   GET  /health        → healthcheck                        │    │
│   │   GET  /verify/:id    → chain-hash integrity check         │    │
│   │   GET  /api/convos    → protected (needs MOJULO_API_KEY)   │    │
│   │   GET  /api/forms     → protected; list form submissions   │    │
│   │   GET  /api/forms/export → protected; CSV export (UTF-8)   │    │
│   │   POST /api/submit-form → captures form locally + relays   │    │
│   │   GET  /api/logs      → protected                          │    │
│   │   GET  /metrics       → Prometheus                         │    │
│   │   GET  /widget        → embeddable JS snippet              │    │
│   │                                                             │    │
│   │  Volumes mounted from host:                                 │    │
│   │    ./config  → /app/config                                  │    │
│   │    ./docs    → /app/documents                               │    │
│   │    ./data    → /app/data  (SQLite persisted here)           │    │
│   └────────────────────────────────────────────────────────────┘    │
│                             │                                        │
│                             │ port 3000                              │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │  End user     │
                      │  (browser or  │
                      │   embedded    │
                      │   widget)     │
                      └───────────────┘
```

---

## 4. Chat Request Flow

```
 Browser                 server.js              RAG               LLM Provider
   │                        │                    │                    │
   │  POST /chat            │                    │                    │
   │  { message, convoId }  │                    │                    │
   ├───────────────────────▶│                    │                    │
   │                        │ rate-limit check   │                    │
   │                        │ (100 req / 15min)  │                    │
   │                        │                    │                    │
   │                        │  search(message)   │                    │
   │                        ├───────────────────▶│                    │
   │                        │                    │ embedQuery (local  │
   │                        │                    │   e5-small ONNX)   │
   │                        │                    │ + cosine over      │
   │                        │                    │   embeddings.json  │
   │                        │◀───────────────────┤ → top-3 chunks     │
   │                        │                    │ (mix of document   │
   │                        │                    │  chunks + triage   │
   │                        │                    │  route descriptions│
   │                        │                    │  by metadata.source)│
   │                        │                    │                    │
   │                        │  load prior turns from SQLite           │
   │                        │                                         │
   │                        │  build prompt:                          │
   │                        │   system = instructions.txt (cached)    │
   │                        │   + retrieved chunks                    │
   │                        │   + conversation history                │
   │                        │                                         │
   │                        │           llm.chat(prompt)              │
   │                        ├────────────────────────────────────────▶│
   │                        │                                         │
   │                        │◀────────────────────────────────────────┤
   │                        │           response                      │
   │                        │                                         │
   │                        │  persist turn to SQLite:                │
   │                        │   - user_prompt, llm_response           │
   │                        │   - rag_context, machine_state          │
   │                        │   - content_hash, chain_hash            │
   │                        │                                         │
   │◀───────────────────────┤                                         │
   │  { answer, suggestions,│                                         │
   │    formTracker?, ... } │                                         │
```

---

## 5. Triage Routing via Vector RAG

Triage routes — "if the user asks X, hand them to deployment Y" — were previously a separate keyword-matching pass. They are now folded into the same vector index as knowledge documents.

**Build-time** (when the operator selects triage destinations in the wizard or chat builder):

1. Each route is `{ deploymentId, name, description }`.
2. [chunker.js → chunkTriageRoutes](control/lib/embedder/chunker.js#L77-L93) emits one chunk per route (descriptions are short — no sub-chunking) with `metadata: { source: 'triage-route', deploymentId, originalName }`.
3. Those chunks go through the same e5-small embedding pass as document chunks and land in the same `embeddings.json` blob.
4. The full `triageRoutes.json` is also written to the artifact — it remains the authoritative list of valid `deploymentId`s the LLM can pick from.

**Runtime:** [vector-rag.js](lite-template/helper/vector-rag.js) inspects each retrieved chunk's `metadata.source`. Triage-route chunks render with the `deploymentId` inline so the LLM sees a direct routing signal alongside the description text:

```
[Triage route — deploymentId: dep_abc123 | name: billing-bot]:
Handles billing questions, payment plan changes, and refund requests…
```

Knowledge chunks render normally (`[From {filename}]: …`). The instructions cartridge tells the LLM how to consume both forms.

**Why the merge.** A single retrieval path serves both triage routing and knowledge lookup. The multilingual embedding model handles cross-lingual semantics directly, so there's no need for stopword tables, locale detection, or a "no hits → query expansion" fallback — cosine similarity over multilingual vectors covers all of it.

**Federated routing.** A triage handoff also carries the sender's tip-of-chain through the URL so the receiver's first turn descends from it, and records a chained `handoff` event row on the sender via `navigator.sendBeacon`. The result is end-to-end tamper-evidence across bot boundaries — each bot keeps its own SQLite, neither reads from the other, but the chain math is continuous. See [docs/federated-routing.md](docs/federated-routing.md).

---

## 6. Cloud Deploy: One-Click to Fly.io

The same artifact that runs locally can be pushed to Fly.io's Machines API without leaving the control plane. The bot image lives on GHCR; per-bot config gets injected via the Machines `files` field at machine create.

```
   Operator                   Control Plane                        Fly Machines API           GHCR
      │                              │                                    │                    │
      │ Click "Deploy to cloud"      │                                    │                    │
      ├─────────────────────────────▶│                                    │                    │
      │                              │ cloudDeploy() — cloud-deploy.js    │                    │
      │                              │                                    │                    │
      │                              │ buildArtifact() if stale           │                    │
      │                              │ (same docker.js path as local      │                    │
      │                              │  — produces the same staged dir)   │                    │
      │                              │                                    │                    │
      │                              │ harvestConfigFiles()               │                    │
      │                              │  → [{guestPath: /app/config/...,  │                    │
      │                              │      contents: <buf>}, ...]        │                    │
      │                              │                                    │                    │
      │                              │ resolveLlmEnv(): pull encrypted    │                    │
      │                              │  LLM key from api_keys vault,      │                    │
      │                              │  decrypt, inject as env var        │                    │
      │                              │                                    │                    │
      │                              │ FlyDeployer.deploy({               │                    │
      │                              │   appName: md5(userId)+botName,    │                    │
      │                              │   image: ghcr.io/zombico/          │                    │
      │                              │     mojulo-bot:0.0.1-test,         │                    │
      │                              │   configFiles, env, region,        │                    │
      │                              │   guest, volumeGb })               │                    │
      │                              │                                    │                    │
      │                              │  POST /apps (idempotent)           │                    │
      │                              ├───────────────────────────────────▶│                    │
      │                              │  GraphQL allocateIpAddress         │                    │
      │                              │   (shared_v4 + v6)                 │                    │
      │                              │  POST /apps/:app/volumes           │                    │
      │                              │   (find-or-create "data")          │                    │
      │                              │  POST /apps/:app/machines          │                    │
      │                              │   { image, env, files (base64),    │                    │
      │                              │     services [80→3000, 443→3000],  │                    │
      │                              │     checks /health, mounts }       │                    │
      │                              │                                    │ pulls image ───────▶│
      │                              │                                    │◀────────────────────┤
      │                              │  POST /apps/:app/machines/:id/wait │                    │
      │                              │                                    │                    │
      │                              │  onProgress({step,message}) →      │                    │
      │                              │   appendCloudProgress (streamed    │                    │
      │                              │   into deployment row's            │                    │
      │                              │   cloud_progress column)           │                    │
      │                              │                                    │                    │
      │  Status pill: "Deployed"     │ finishCloudDeploy(url, machineId,  │                    │
      │  URL: https://{app}.fly.dev  │  volumeId) → set deployments.url   │                    │
      │◀─────────────────────────────┤                                    │                    │
```

**Patterns enforced** by [FlyDeployer](control/lib/deployers/fly.js) (codified inline at the top of the file):

1. **One image, config injected per machine.** The bot image is bot-agnostic; per-bot `config/*.json` and `embeddings.json` come in via the Machines `files[]` field as base64 blobs. No image rebuild per bot.
2. **Volume named `data`, find-or-create.** Fly's API doesn't enforce volume-name uniqueness, so blind POST orphans the previous volume. List-first is the only correct approach.
3. **Deterministic app name** = `${md5(userId).slice(0,8)}-${botName}`. Same inputs → same app, so a redeploy after losing the control-plane row is self-healing.
4. **Lifecycle ops are thin platform mappings.** `pause` stops machines, `resume` starts them, `destroy` deletes machines + app (cascades to volume + IPs). All idempotent against current state.
5. **Progress events stream** through an `onProgress` callback into `deployments.cloud_progress`, surfaced in the UI as a live deploy log.

**GHCR publish flow** (the image side): `.github/workflows/publish-bot-image.yml` builds [lite-template/Dockerfile](lite-template/Dockerfile), runs `scripts/fetch-embed-model.mjs` to pull the e5-small ONNX into the image, and pushes both `:X.Y.Z` and `:latest`. The control plane pins an exact tag in [docker.js:20](control/lib/deployers/docker.js#L20) — never `:latest`.

**Connect Bot is automatic for cloud deploys.** Once `cloudDeploy()` returns the `*.fly.dev` URL, it's written to `deployments.url` via `finishCloudDeploy`, so the conversations browser works without a manual paste — the artifact's `MOJULO_API_KEY` was already injected as a Fly env var in the same call.

---

## 7. Connect Bot: Browsing Live Conversations from the Control Plane

The artifact persists conversations in its own SQLite (`data/conversation.db`) and exposes them via API-key-protected endpoints. **Connect Bot** lets the operator paste the running bot's URL into the control plane so the dashboard can proxy through to those endpoints — without ever exporting the database.

### How the trust works

- At build time, [DockerDeployer](control/lib/deployers/docker.js) writes the deployment row's `api_key` into the artifact's `.env` as `MOJULO_API_KEY`.
- The same `api_key` lives on the deployment row in the control plane DB.
- "Connect" is just **pasting the bot's URL onto the row** — both sides already share the key, so the proxy can authenticate by attaching `x-mojulo-api-key: <row.apiKey>` to every forwarded request.

### Connect / probe / disconnect

```
 Operator                Control Plane                       Bot
   │                          │                                │
   │  Paste URL in modal      │                                │
   │  (dashboard ConnectModal)│                                │
   ├─────────────────────────▶│                                │
   │                          │ POST /api/deployments/:id/     │
   │                          │      connection { url }        │
   │                          │                                │
   │                          │ normalizeBotUrl(url)           │
   │                          │ probeBotConnection(url, apiKey)│
   │                          │                                │
   │                          │  GET /api/conversations        │
   │                          │  x-mojulo-api-key: <apiKey>    │
   │                          ├───────────────────────────────▶│
   │                          │                                │ validateApiKey
   │                          │◀───────────────────────────────┤ 200 OK (or 401)
   │                          │                                │
   │                          │ on 200 → DeploymentRepository  │
   │                          │   .setUrl(id, url)             │
   │                          │ (writes deployments.url +      │
   │                          │  last_seen_at)                 │
   │                          │                                │
   │  Status pill turns green │                                │
   │  ("Connected — last seen │                                │
   │   ...")                  │                                │
```

A `DELETE /api/deployments/:id/connection` clears `url` + `last_seen_at` (the row, the `api_key`, and the bot itself are untouched — disconnect is purely a control-plane forget).

### Browsing conversations (proxied reads)

Once connected, the dashboard's [conversations page](control/app/dashboard/deployments/[id]/conversations/page.jsx) calls control-plane routes that all forward to the bot through [bot-proxy.js](control/lib/deployers/bot-proxy.js):

| Control-plane route | Forwards to bot |
|---|---|
| `GET /api/deployments/:id/conversations` (+ `conversationId` / `startDate` / `endDate` / paging) | `GET /api/conversations` |
| `GET /api/deployments/:id/conversations/:conversationId` | `GET /api/conversations/:conversationId` |
| `GET /api/deployments/:id/conversations/export` (60s timeout for large dumps) | `GET /api/conversations/export` |
| `GET /api/deployments/:id/submissions` | `GET /api/forms` |
| `GET /api/deployments/:id/submissions/export` | `GET /api/forms/export` |
| `GET /api/deployments/:id/storage` | bot storage stats |

```
 Browser              Control Plane                Bot (artifact)
   │                       │                          │
   │ GET .../conversations │                          │
   ├──────────────────────▶│                          │
   │                       │ DeploymentRepository     │
   │                       │   .findById(id)          │
   │                       │ if !deployment.url       │
   │                       │   → 409 "not connected"  │
   │                       │                          │
   │                       │ fetchFromBot(            │
   │                       │   deployment,            │
   │                       │   '/api/conversations?…',│
   │                       │   30s timeout)           │
   │                       ├─────────────────────────▶│
   │                       │   x-mojulo-api-key       │ middleware/auth.js
   │                       │                          │ → SQLite query
   │                       │◀─────────────────────────┤ { conversations,
   │                       │                          │   pagination }
   │                       │ touchLastSeen(id)        │
   │                       │   (refreshes green pill) │
   │◀──────────────────────┤ { …, botName }           │
```

If the bot is unreachable mid-session, proxy routes return `502` with the underlying reason (`timeout`, `network`, `bad_status`); the page surfaces an "unreachable" banner. A fresh `last_seen_at` (within ~5 min) keeps the deployment-row dot green; older = grey "(stale)".

### Why this design

- **No conversation data crosses into the control plane DB.** The control plane stores only `url` + `last_seen_at` per row; conversation rows live solely in the artifact's SQLite. Disconnecting or moving the bot doesn't migrate or duplicate user data.
- **The shared `api_key` removes a UX step.** The operator never copy-pastes a key — pasting the URL is enough because both sides already agree on the key from build time.
- **Works for any reachable URL.** `localhost:3001`, a LAN host, an ngrok tunnel, a cloud VM — the probe just needs an HTTP(S) endpoint that answers `/api/conversations` with the right key.

Key files:

| File | Role |
|------|------|
| [control/app/api/deployments/[id]/connection/route.js](control/app/api/deployments/[id]/connection/route.js) | `POST` (probe + save URL), `DELETE` (forget URL) |
| [control/lib/deployers/bot-proxy.js](control/lib/deployers/bot-proxy.js) | `normalizeBotUrl`, `probeBotConnection`, `fetchFromBot` |
| [control/app/api/deployments/[id]/conversations/route.js](control/app/api/deployments/[id]/conversations/route.js) | List/search proxy |
| [control/app/api/deployments/[id]/conversations/[conversationId]/route.js](control/app/api/deployments/[id]/conversations/[conversationId]/route.js) | Single-conversation proxy |
| [control/app/api/deployments/[id]/conversations/export/route.js](control/app/api/deployments/[id]/conversations/export/route.js) | Bulk export passthrough (streams body) |
| [control/app/dashboard/page.jsx](control/app/dashboard/page.jsx) | `ConnectModal` UI + connection-state pill |
| [control/app/dashboard/deployments/[id]/conversations/page.jsx](control/app/dashboard/deployments/[id]/conversations/page.jsx) | Proxied conversations browser |
| [control/lib/db/repositories/deployments.js](control/lib/db/repositories/deployments.js) | `setUrl`, `clearUrl`, `touchLastSeen` |
| [lite-template/server.js:817](lite-template/server.js#L817) | Bot-side `GET /api/conversations` |
| [lite-template/server.js:579](lite-template/server.js#L579) | Bot-side `GET /api/conversations/:conversationId` |
| [lite-template/server.js:512](lite-template/server.js#L512) | Bot-side `GET /api/conversations/export` |
| [lite-template/middleware/auth.js](lite-template/middleware/auth.js) | `MOJULO_API_KEY` guard the proxy passes through |

---

## 8. Key Files

| File | Role |
|------|------|
| [control/lib/deployers/docker.js](control/lib/deployers/docker.js) | Builds the local artifact |
| [control/lib/deployers/docker.js:259-393](control/lib/deployers/docker.js#L259-L393) | `deploy()` orchestration |
| [control/lib/deployers/docker.js:75-103](control/lib/deployers/docker.js#L75-L103) | `buildDockerCompose()` (pulls pinned GHCR image, or builds local in offline mode) |
| [control/lib/deployers/fly.js](control/lib/deployers/fly.js) | Fly.io Machines API deployer — provision/update/pause/resume/destroy |
| [control/lib/deployers/cloud-deploy.js](control/lib/deployers/cloud-deploy.js) | Cloud-deploy orchestration: builds artifact, harvests config files, decrypts LLM key, drives provider deployer |
| [control/lib/deployers/index.js](control/lib/deployers/index.js) | Provider registry (`getCloudDeployer('fly')`) |
| [control/lib/deployers/bot-proxy.js](control/lib/deployers/bot-proxy.js) | `normalizeBotUrl`, `probeBotConnection`, `fetchFromBot` (Connect Bot proxy) |
| [control/lib/embedder/chunker.js](control/lib/embedder/chunker.js) | `chunkDocuments` + `chunkTriageRoutes` — 512-char window, 50-char overlap |
| [control/app/api/vectorize-rag/route.js](control/app/api/vectorize-rag/route.js) | Wizard-side embedding endpoint (also called by chat builder via tool) |
| [.github/workflows/publish-bot-image.yml](.github/workflows/publish-bot-image.yml) | Builds + publishes `ghcr.io/zombico/mojulo-bot:X` |
| [lite-template/server.js:~1340-1420](lite-template/server.js) | Runtime bootstrap (LLM init, instructions cache, VectorRAG init + warmup) |
| [lite-template/helper/llm-client.js](lite-template/helper/llm-client.js) | Provider abstraction (Anthropic, OpenAI, Ollama + adapters) |
| [lite-template/helper/llm-client.js:208-272](lite-template/helper/llm-client.js#L208-L272) | Anthropic adapter (prompt caching) |
| [lite-template/helper/vector-rag.js](lite-template/helper/vector-rag.js) | Cosine retrieval over baked `config/embeddings.json`; renders triage-route chunks with `deploymentId` inline |
| [lite-template/helper/prompt-assembler.js](lite-template/helper/prompt-assembler.js) | Pure: vector retrieval + LLM generate (no rewrite ladder, no locale detection) |
| [lite-template/helper/embedder-local.js](lite-template/helper/embedder-local.js) | In-process query embedding via `@huggingface/transformers` + multilingual-e5-small q8 ONNX. `env.allowRemoteModels = false` — fully offline at runtime |
| [lite-template/scripts/fetch-embed-model.mjs](lite-template/scripts/fetch-embed-model.mjs) | npm `postinstall` hook that downloads the q8 ONNX into `models/`. ONNX file is gitignored (113MB > GitHub's 100MB limit) |
| [lite-template/middleware/auth.js](lite-template/middleware/auth.js) | `MOJULO_API_KEY` guard for `/api/*` |
| [lite-template/Dockerfile](lite-template/Dockerfile) | Debian slim Node 20 image (Alpine's musl is incompatible with onnxruntime-node's prebuilt glibc binaries) |

