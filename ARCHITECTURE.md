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
  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
  │ Copy template│           │  Compose     │           │  Parse docs  │
  │              │           │ instructions │           │  → text      │
  │ lite-template│           │              │           │              │
  │  (excludes   │           │ composer.js  │           │ PDF/DOCX/XLSX│
  │ node_modules,│           │ merges:      │           │ → documents/ │
  │ .env, config,│           │ - 00_base    │           │              │
  │ documents/,  │           │ - 01_knowledge│          │              │
  │ data/)       │           │ - 02_forms   │           │              │
  │              │           │ - 03_appts   │           │              │
  │              │           │ - 04_triage  │           │              │
  └──────┬───────┘           └──────┬───────┘           └──────┬───────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    ▼
                     ┌──────────────────────────────────────┐
                     │  Write generated files:              │
                     │  - config/config.json (identity,LLM) │
                     │  - config/instructions.txt           │
                     │  - config/ragSummary.txt             │
                     │  - config/formFormat.json            │
                     │  - config/calendarConfig.json        │
                     │  - config/triageRoutes.json          │
                     │  - docker-compose.yml                │
                     │  - .env.example + .env (admin key)   │
                     │  - README.md                         │
                     └──────────────┬───────────────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────────────┐
                     │     bot-{name}-{timestamp}.zip       │
                     │     ← download URL returned to user  │
                     └──────────────────────────────────────┘
```

Key build steps live in [control/lib/deployers/docker.js:174-317](control/lib/deployers/docker.js#L174-L317).

---

## 2. Artifact Layout (the ZIP)

What the user gets when they unzip:

```
bot-{name}/
├── Dockerfile                ← Debian slim Node 20 + native deps (better-sqlite3, onnxruntime-node)
├── docker-compose.yml        ← Exposes :3000, mounts ./data ./config ./documents
├── .env                      ← Pre-filled admin API key; user adds LLM key
├── .env.example              ← Hints for all supported providers
├── README.md                 ← One-command launch instructions
├── server.js                 ← Express entry point
├── package.json
│
├── client/                   ← Static chat UI (HTML/JS/CSS)
│   └── index.html            ← Config injected at serve time
│
├── helper/
│   ├── llm-client.js         ← 6-provider abstraction
│   ├── rag.js                ← SimpleRAG keyword search (locale-aware)
│   ├── vector-rag.js         ← VectorRAG (cosine over baked embeddings.json)
│   └── embedder-local.js     ← multilingual-e5-small ONNX, in-process query embedding
│
├── middleware/
│   └── auth.js               ← Guards /api/* with MOJULO_API_KEY
│
├── integration/              ← Webhooks, analytics hooks
│
├── models/                   ← multilingual-e5-small q8 ONNX + tokenizer
│   └── Xenova/multilingual-e5-small/
│       ├── onnx/model_quantized.onnx   ← gitignored at source; fetched by
│       │                                  scripts/fetch-embed-model.mjs at
│       │                                  npm-install / Docker-build time
│       └── {config.json, tokenizer.json, ...}
│
├── config/                   ← Baked at build time
│   ├── config.json           ← Bot identity + LLM provider/model + rag.mode
│   ├── instructions.txt      ← Composed protocol cartridges
│   ├── ragSummary.txt        ← Keyword search hints (keyword mode only)
│   ├── embeddings.json       ← {model, chunks:[{text,embedding,...}]} (vector mode only)
│   ├── formFormat.json       ← (if forms enabled)
│   ├── calendarConfig.json   ← (if appointments enabled)
│   └── triageRoutes.json     ← (if triage enabled)
│
├── documents/                ← Parsed doc text (keyword RAG corpus; absent in vector mode)
│   └── {doc1}.txt, {doc2}.txt, ...
│
└── data/                     ← Created at runtime (SQLite lives here)
    └── conversation.db       ← turns + content/chain hashes + form_submissions
```

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
│   │  │  Startup (server.js:1165-1232):                    │    │    │
│   │  │    1. Load config/config.json                      │    │    │
│   │  │    2. Merge env vars (LLM_PROVIDER, *_API_KEY)     │    │    │
│   │  │    3. Init LLM client (llm-client.js)              │    │    │
│   │  │    4. Cache instructions.txt + ragSummary.txt      │    │    │
│   │  │    5. Init RAG: SimpleRAG from documents/ OR       │    │    │
│   │  │       VectorRAG from config/embeddings.json (warms │    │    │
│   │  │       embedder-local.js → loads ONNX into memory)  │    │    │
│   │  │    6. Open SQLite (data/conversation.db)           │    │    │
│   │  │                                                     │    │    │
│   │  └────────────────────────────────────────────────────┘    │    │
│   │                                                             │    │
│   │  Endpoints:                                                 │    │
│   │   GET  /              → serves client/ with injected config│    │
│   │   POST /chat          → main conversation (rate-limited)   │    │
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
   │                        │                    │ keyword: tf-idf    │
   │                        │                    │   over documents/  │
   │                        │                    │ vector: embedQuery │
   │                        │                    │   + cosine over    │
   │                        │                    │   embeddings.json  │
   │                        │◀───────────────────┤ → top chunks       │
   │                        │                    │                    │
   │                        │  (keyword mode: query expansion fallback if no hits)
   │                        │                    │                    │
   │                        │  load prior turns from SQLite           │
   │                        │                                         │
   │                        │  build prompt:                          │
   │                        │   system = instructions.txt (cached)    │
   │                        │   + ragSummary.txt (cached, 5min TTL)   │
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

## 5. Key Files

| File | Role |
|------|------|
| [control/lib/deployers/docker.js](control/lib/deployers/docker.js) | Builds the artifact |
| [control/lib/deployers/docker.js:174-317](control/lib/deployers/docker.js#L174-L317) | `deploy()` orchestration |
| [control/lib/deployers/docker.js:47-71](control/lib/deployers/docker.js#L47-L71) | `buildDockerCompose()` |
| [lite-template/server.js:1165-1232](lite-template/server.js#L1165-L1232) | Runtime bootstrap |
| [lite-template/server.js:277-372](lite-template/server.js#L277-L372) | `POST /chat` handler |
| [lite-template/server.js:234-244](lite-template/server.js#L234-L244) | SQLite init |
| [lite-template/helper/llm-client.js](lite-template/helper/llm-client.js) | Provider abstraction |
| [lite-template/helper/llm-client.js:208-272](lite-template/helper/llm-client.js#L208-L272) | Anthropic adapter (prompt caching) |
| [lite-template/helper/rag.js](lite-template/helper/rag.js) | Keyword RAG over documents/. Locale-aware: whitespace tokenization for Latin, character bigrams for ja/zh/ko/th (see [MULTILINGUAL-RAG-PLAN](../dragbot-control/docs/MOJULO-LITE-MULTILINGUAL-RAG-PLAN.md)) |
| [lite-template/helper/vector-rag.js](lite-template/helper/vector-rag.js) | Vector RAG: cosine over baked `config/embeddings.json` |
| [lite-template/helper/embedder-local.js](lite-template/helper/embedder-local.js) | In-process query embedding via `@huggingface/transformers` + multilingual-e5-small q8 ONNX. `env.allowRemoteModels = false` — fully offline at runtime |
| [lite-template/scripts/fetch-embed-model.mjs](lite-template/scripts/fetch-embed-model.mjs) | npm `postinstall` hook that downloads the q8 ONNX into `models/`. The ONNX file is gitignored (113MB > GitHub's 100MB limit); npm-install / Docker-build re-fetches it |
| [lite-template/middleware/auth.js](lite-template/middleware/auth.js) | `MOJULO_API_KEY` guard |
| [lite-template/Dockerfile](lite-template/Dockerfile) | Debian slim Node 20 image (Alpine's musl is incompatible with onnxruntime-node's prebuilt glibc binaries) |

---

## 6. Contrast with Main Mojulo

| Aspect | Mojulo Lite | Mojulo (dragbot-control) |
|--------|-------------|--------------------------|
| Delivery | ZIP download, user runs anywhere | K8s deploy managed by control plane |
| Config source | Baked into artifact at build | Fetched from control plane at runtime |
| Database | SQLite in mounted volume | SQLite (container) + PostgreSQL (aggregated) |
| RAG | Keyword (locale-aware: whitespace for Latin, char bigrams for ja/zh/ko/th) **or** vector (multilingual-e5-small q8 ONNX, in-process via `@huggingface/transformers`, no Infinity dependency) | Keyword + vector (BGE-M3 via Infinity sidecar) |
| LLM providers | Anthropic, OpenAI, Gemini, Cohere, Bedrock, Ollama | Same set minus Ollama |
| Scaling | Single instance per ZIP, user-managed | Fleet-managed, per-bot subdomains |
| Sync/analytics | Self-contained, no phone-home | Daily sync back to PostgreSQL |

**Design intent:** Mojulo Lite trades fleet management for portability — a single-file artifact anyone can run without signing up for a platform.
