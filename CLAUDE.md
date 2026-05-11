# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape

Two-package monorepo. Both must usually be understood together:

- [control/](control/) — Next.js 16 control plane (port 3001). The "factory" that compiles bots.
- [lite-template/](lite-template/) — Express 5 bot runtime (port 3000). The thing that gets compiled and shipped.

The control plane stages files from [lite-template/](lite-template/) into a per-bot zip; the same source tree is also published as the GHCR image `ghcr.io/zombico/mojulo-bot:X.Y.Z` via [.github/workflows/publish-bot-image.yml](.github/workflows/publish-bot-image.yml). When you change [lite-template/](lite-template/) you typically also need to bump [BOT_IMAGE](control/.env.example) (or rely on `MOJULO_OFFLINE_BUILD=1` to bundle source instead of pulling).

[ARCHITECTURE.md](ARCHITECTURE.md) is the source of truth for build-time → runtime data flow, including diagrams. Always read it before non-trivial changes that cross the control/lite-template boundary.

## Commands

### Control plane ([control/](control/))

```bash
cd control
cp .env.example .env        # first-time only
npm install
npm run dev                 # Next.js on http://localhost:3001
npm run build               # next build
npm run start               # next start -p 3001
npm run build:bot           # docker build -t mojulo/bot:latest ../lite-template (offline-mode artifacts)
node scripts/cleanup-stale-artifacts.js [--dry-run]   # GC zips whose deployment_id is gone
```

There is **no test runner, lint, or typecheck script** in either package. To smoke-check a JS file: `node --check <file>`. For JSX, parse with `@babel/parser` (see [.claude/settings.local.json](.claude/settings.local.json) for the exact invocation that has been pre-approved).

Path alias in control: `@/*` → `./*` (see [control/jsconfig.json](control/jsconfig.json)).

### Bot runtime ([lite-template/](lite-template/))

```bash
cd lite-template
npm install                 # postinstall fetches multilingual-e5-small q8 ONNX (~113MB) into models/
npm start                   # node server.js  (port 3000)
docker compose up           # uses the local Dockerfile; Debian slim Node 20
```

The `.onnx` weights are gitignored (>100MB). They're fetched by [scripts/fetch-embed-model.mjs](lite-template/scripts/fetch-embed-model.mjs) at `npm install` and again inside the Docker build. **Do not commit them.**

### Bot image publish

Tag a release `bot-vX.Y.Z` and push the tag — [publish-bot-image.yml](.github/workflows/publish-bot-image.yml) builds multi-arch (amd64+arm64) and pushes `ghcr.io/zombico/mojulo-bot:X.Y.Z` plus `:latest` (latest only on default branch). The control plane pins an exact tag in [control/lib/deployers/docker.js](control/lib/deployers/docker.js) — never use `:latest` from the control plane side.

## Architecture, the parts that need multiple files to grasp

### The "two builders, one config" shape

The chat builder ([control/app/chat-builder/](control/app/chat-builder/), [control/lib/builder/](control/lib/builder/)) and the wizard ([control/components/wizard/modular/](control/components/wizard/modular/)) both converge on [buildDeploymentConfig()](control/lib/config-builder.js) producing the **same deployment config shape**. From that point downstream — composer, embedder, deployer — there is no branch on which builder produced the config. Don't add paradigm-specific logic past `config-builder.js`.

The chat builder is Claude tool-use over SSE. Tools are defined in [control/lib/builder/tools.js](control/lib/builder/tools.js), executed in [control/lib/builder/tool-executors.js](control/lib/builder/tool-executors.js), driven from [control/app/api/builder/stream/route.js](control/app/api/builder/stream/route.js). See [docs/chat-builder.md](docs/chat-builder.md) and [docs/wizard-builder.md](docs/wizard-builder.md).

### Build pipeline (control plane → zip)

[DockerDeployer.deploy()](control/lib/deployers/docker.js) is the entrypoint. It:

1. Composes `instructions.txt` from the enabled cartridges in [control/lib/composer/protocols/](control/lib/composer/protocols/) (`00_base`, `01_knowledge`, `02_form-gathering`, `03_appointments`, `04_triage`, `05_optical-read`).
2. Copies the prebaked `embeddings.json` (built upstream by [control/app/api/vectorize-rag/route.js](control/app/api/vectorize-rag/route.js)) — knowledge chunks AND triage-route chunks share one cosine index, distinguished by `metadata.source`.
3. Writes `config/`, `docker-compose.yml`, `.env`, `.env.example`, `README.md` into a staging dir and zips it.

Two build modes — see `PREBUILT_EXCLUDES` in [control/lib/deployers/docker.js](control/lib/deployers/docker.js):

- **Prebuilt-image** (default): zip ships only config; bot pulls from GHCR.
- **Offline-build** (`MOJULO_OFFLINE_BUILD=1`): zip bundles full lite-template source + Dockerfile so `docker compose up --build` works air-gapped.

### Cloud deploy (Fly.io)

Same artifact path. [cloudDeploy()](control/lib/deployers/cloud-deploy.js) builds the zip if stale, harvests `config/*` files, decrypts the LLM key from `api_keys`, and hands off to [FlyDeployer](control/lib/deployers/fly.js). Per-bot config is injected via the Machines API `files[]` field as base64 — **the image is bot-agnostic, never rebuilt per bot**. The patterns codified at the top of `fly.js` (deterministic app name, find-or-create volume, idempotent lifecycle) are load-bearing — read those comments before changing anything in that file.

### Connect Bot proxy

Conversation data **never leaves the bot's SQLite**. The control plane stores only `url` + `last_seen_at` on the `deployments` row. Both sides already share `MOJULO_API_KEY` (written into the artifact's `.env` at build time, kept on the deployment row). [bot-proxy.js](control/lib/deployers/bot-proxy.js) (`probeBotConnection`, `fetchFromBot`) is the only path; all `/api/deployments/[id]/conversations*` and `/api/deployments/[id]/submissions*` routes in the control plane forward through it. Don't introduce a route that copies conversation rows into the control-plane DB.

### Tamper-evident chain

Every bot turn writes `content_hash` + `chain_hash` to SQLite; `/verify/:id` walks the chain. Triage handoffs extend the chain across bots via URL-carried tip-of-chain + a `sendBeacon`-posted `handoff` event row on the sender. See [docs/turn-hashing.md](docs/turn-hashing.md) and [docs/federated-routing.md](docs/federated-routing.md). Don't insert turn rows that bypass the hashing helpers.

### Vector RAG, fully in-process

[lite-template/helper/embedder-local.js](lite-template/helper/embedder-local.js) loads multilingual-e5-small q8 ONNX via `@huggingface/transformers` with `env.allowRemoteModels = false` — **the bot never makes embedding-API calls at runtime**. The query embedder runs in-process; cosine search runs over the baked `config/embeddings.json`. If `embeddings.json` is missing, RAG silently disables. See [docs/vector-rag.md](docs/vector-rag.md).

### LLM provider abstraction

[lite-template/helper/llm-client.js](lite-template/helper/llm-client.js) supports Anthropic, OpenAI, and Ollama. The Anthropic adapter uses **forced tool use** (`respond` tool, schema in [lite-template/helper/response-schema.js](lite-template/helper/response-schema.js)) so envelope JSON is structurally guaranteed; other adapters still rely on the [server.js](lite-template/server.js) `extractJSON` + fallback path. See [control/ANTHROPIC_TOOL_USE_PLAN.md](control/ANTHROPIC_TOOL_USE_PLAN.md). When adding fields to the response envelope, update the schema **and** cross-check protocol cartridges in [control/lib/composer/protocols/](control/lib/composer/protocols/).

## Native dependency landmines

- **`onnxruntime-node` is glibc-only.** The Dockerfile uses `node:20-bookworm-slim`, not Alpine. Don't switch to Alpine — the prebuilt binaries crash on musl.
- **`better-sqlite3` compiles per arch.** That's why the GHCR build is multi-arch; on the host, `npm install` rebuilds against the local arch.
- **The 113MB ONNX file** is fetched by `postinstall` and is gitignored. Both [control/scripts/fetch-embed-model.js](control/scripts/fetch-embed-model.js) (control plane wizard preview path) and [lite-template/scripts/fetch-embed-model.mjs](lite-template/scripts/fetch-embed-model.mjs) (bot path) exist independently — don't try to share them across packages.
- **Next.js externals.** The control plane's [next.config.mjs](control/next.config.mjs) marks `better-sqlite3`, `archiver`, `pdf2json`, `officeparser`, `@huggingface/transformers`, `onnxruntime-node`, `sharp` as `serverExternalPackages` — adding another native dep usually means adding it here too.

## Data layout

- Control plane SQLite: [control/data/mojulo-lite.db](control/data/) — tables `api_keys`, `documents`, `deployments`, `modular_sessions`, plus migration-added columns (`config_hash`, `last_built_hash`, `url`, `last_seen_at`, `cloud_progress`, etc — see migration block in [control/lib/db/index.js](control/lib/db/index.js)). WAL mode, foreign keys on. Repositories live in [control/lib/db/repositories/](control/lib/db/repositories/).
- Generated zips: [control/data/artifacts/](control/data/artifacts/) (cleaned by `scripts/cleanup-stale-artifacts.js`).
- Uploaded documents (originals + parsed text): [control/data/storage/](control/data/storage/).
- Bot SQLite: `data/conversation.db` inside each bot's `./data/` mount (created at first run).

## Status reminders baked into the project

- The control plane has **no auth**. It is single-user, self-hosted. Don't expose it to the public internet, and don't add features that assume multi-tenancy.
- Versioning is `0.x`. Artifact format and bot image are pinned per-control-plane-version. When the artifact shape changes, the pinned [BOT_IMAGE](control/.env.example) tag in `.env.example` and the `docker.js` constant must move together.

## Coding Standards
- When outputting new UI, ensure strings are i18n in EN