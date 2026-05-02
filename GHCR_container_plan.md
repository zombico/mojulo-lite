# GHCR Prebuilt Bot Image — Implementation Plan

## Goal

Eliminate `docker compose build` from the user's launch path. Today the user does
`unzip → docker compose build (~3 min: apt install + npm ci + native compile +
113MB ONNX download) → docker compose up`. After this change the user does
`unzip → docker compose up` and a single `docker pull` of a prebuilt image
(~30 s on a typical connection) replaces the build entirely.

The image itself is identical across deployments — every per-bot artifact lives
in mounted volumes (`./config`, `./documents`, `./data`). So one published
image serves all bots; only the artifact ZIP varies.

---

## Locked decisions

| | |
|---|---|
| **Image coordinates** | `ghcr.io/zombico/mojulo-bot` |
| **Tag scheme** | git tag `bot-vX.Y.Z` → image tags `X.Y.Z` and `latest` |
| **First release** | `bot-v0.1.0` |
| **Bump policy** | Minor bump per release (`0.1.0` → `0.2.0` → `0.3.0`); major stays at `0` until a 1.0 cut |
| **Architectures** | `linux/amd64` + `linux/arm64` (Apple Silicon native) |
| **Offline fallback** | `MOJULO_OFFLINE_BUILD=1` env on the control plane keeps the current `build: .` path for users who can't reach GHCR |

---

## Phase 1 — Make the image multi-arch

**Why first:** the published image must work on both arches before CI relies on
it. Currently [Dockerfile:7](lite-template/Dockerfile#L7) pins
`--platform=linux/amd64`, which forces Apple Silicon users to run under QEMU
emulation. Dropping the pin is a precondition.

**Change:**

```diff
- FROM --platform=linux/amd64 node:20-bookworm-slim
+ FROM node:20-bookworm-slim
```

**Verify locally:**

```bash
cd lite-template
docker buildx create --use --name mojulo-builder
docker buildx build --platform linux/amd64,linux/arm64 .
```

`better-sqlite3` builds from source on both arches; `onnxruntime-node` ships
arm64 prebuilds. Should succeed without further changes.

**Stop here for review** before publishing.

---

## Phase 2 — Manual one-time publish (validate the path)

User-driven. I'll provide commands; you run them.

**Prereqs:**

- GitHub PAT at github.com/settings/tokens with scopes `write:packages`,
  `read:packages`. Save as `$GHCR_PAT`.
- Logged in as a user with push rights on `github.com/zombico` org.

**Commands:**

```bash
echo $GHCR_PAT | docker login ghcr.io -u <gh-username> --password-stdin

cd lite-template
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/zombico/mojulo-bot:0.0.1-test \
  --push \
  .
```

**Then in GHCR UI** (github.com/orgs/zombico/packages):

- Open the `mojulo-bot` package → Package settings → **Change visibility →
  Public**. GHCR defaults to private; anonymous `docker pull` would 403
  otherwise. This is the #1 footgun.

**Smoke test on a clean machine** (or wipe local image cache first):

```bash
docker pull ghcr.io/zombico/mojulo-bot:0.0.1-test
docker run --rm -p 3000:3000 ghcr.io/zombico/mojulo-bot:0.0.1-test
# in another terminal:
curl http://localhost:3000/health
```

If `/health` answers, the path works. The container won't have config mounted
so chat won't function, but a healthy process proves the image runs.

---

## Phase 3 — Automate publish in GitHub Actions

Create [.github/workflows/publish-bot-image.yml](.github/workflows/publish-bot-image.yml):

```yaml
name: Publish bot image
on:
  push:
    tags: ['bot-v*']
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository_owner }}/mojulo-bot
          tags: |
            type=match,pattern=bot-v(.*),group=1
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v5
        with:
          context: ./lite-template
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Notes:**

- `secrets.GITHUB_TOKEN` is auto-injected; no PAT needed in CI.
- The `type=match` pattern strips the `bot-v` prefix so `bot-v0.1.0` →
  image tag `0.1.0`.
- `type=raw,value=latest,enable={{is_default_branch}}` only adds `:latest` when
  the workflow runs from the default branch, so accidental tags from feature
  branches don't move `:latest`.
- `cache-from/to: type=gha` reuses Buildx layer cache across CI runs;
  unchanged layers don't rebuild.

**Release flow once landed:**

```bash
git tag bot-v0.1.0
git push --tags
```

Workflow fires → image lands at `ghcr.io/zombico/mojulo-bot:0.1.0` and
`:latest`.

---

## Phase 4 — Wire image into the artifact generator

In [control/lib/deployers/docker.js](control/lib/deployers/docker.js):

### 4a. Add image constants (near line 17)

```js
const BOT_IMAGE =
  process.env.BOT_IMAGE || 'ghcr.io/zombico/mojulo-bot:0.1.0';
const OFFLINE_BUILD = process.env.MOJULO_OFFLINE_BUILD === '1';
```

### 4b. Rewrite `buildDockerCompose` ([docker.js:48-72](control/lib/deployers/docker.js#L48-L72))

```js
function buildDockerCompose(botName) {
  const imageOrBuild = OFFLINE_BUILD
    ? 'build: .\n    image: mojulo/bot:local'
    : `image: ${BOT_IMAGE}`;

  return `version: '3.8'

services:
  ${botName}:
    ${imageOrBuild}
    container_name: ${botName}
    ports:
      - "${BOT_DEFAULT_PORT}:3000"
    env_file:
      - .env
    volumes:
      - ./data:/data
      - ./config:/app/config
      - ./documents:/app/documents
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
`;
}
```

### 4c. Expand `TEMPLATE_EXCLUDES` for the prebuilt-image path

Today's [TEMPLATE_EXCLUDES](control/lib/deployers/docker.js#L19-L27) only
excludes runtime/output dirs. With a prebuilt image, everything baked in is
dead weight in the ZIP.

Add a second exclude set used only when `OFFLINE_BUILD` is false:

```js
const PREBUILT_EXCLUDES = new Set([
  ...TEMPLATE_EXCLUDES,
  'Dockerfile',
  '.dockerignore',
  'server.js',
  'package.json',
  'package-lock.json',
  'helper',
  'middleware',
  'client',
  'models',
  'scripts',
  'integration',
]);
```

Pass the right set into `copyTemplateFiles` based on the mode.

**Resulting ZIP contents (prebuilt mode):**

```
bot-{name}/
├── docker-compose.yml
├── .env
├── .env.example
├── README.md
├── config/
│   └── (config.json, instructions.txt, ragSummary.txt, embeddings.json, ...)
└── documents/
    └── (parsed text)
```

Tens of KB instead of MB. The `data/` dir is created on first run by Docker.

### 4d. Update `buildReadme` ([docker.js:100-176](control/lib/deployers/docker.js#L100-L176))

The line:

> First run builds the image locally (~60s). Subsequent runs skip straight to start.

becomes incorrect. Replace with:

> First run pulls the bot image from GHCR (~30s on a typical connection); subsequent runs are instant.

And the line `docker compose up --build` → `docker compose up` (no rebuild
needed).

Add a one-liner about the offline path: "If your network can't reach
ghcr.io, set `MOJULO_OFFLINE_BUILD=1` on the control plane to receive a
build-from-source artifact."

---

## Phase 5 — Test cutover

1. With `BOT_IMAGE=ghcr.io/zombico/mojulo-bot:0.0.1-test` (the manual-publish
   tag from Phase 2), generate an artifact via the existing
   `POST /api/deploy` flow.
2. Unzip on a clean machine or wipe local Docker images first
   (`docker image prune -a`).
3. `docker compose up`. Time it. Should be ~30 s pull + a few seconds boot.
4. Hit the chat endpoint, verify config came through (bot name, LLM provider,
   RAG mode).
5. Test the offline path: `MOJULO_OFFLINE_BUILD=1` → generate artifact →
   confirm the ZIP includes `Dockerfile`, `server.js`, etc., and
   `docker compose up` builds locally as before.

---

## Phase 6 — Cut the real release

1. `git tag bot-v0.1.0 && git push --tags` — CI publishes
   `ghcr.io/zombico/mojulo-bot:0.1.0` and `:latest`.
2. Bump `BOT_IMAGE` default in [docker.js](control/lib/deployers/docker.js)
   from the test tag to `0.1.0`.
3. Land the change.
4. Future releases: change `lite-template/` → tag `bot-v0.2.0` → bump
   `BOT_IMAGE` default in `docker.js`.

**Pinning policy:** the artifact always pins an exact version. Never ship
`:latest` to users — a future image change must not silently affect
already-downloaded bots.

---

## Phase 7 — Update `ARCHITECTURE.md`

Sections that go stale after this change:

- **§2 Artifact Layout** — most of the tree (Dockerfile, server.js, helper/,
  middleware/, client/, models/, scripts/, package*.json) is no longer in the
  ZIP. Show two trees: prebuilt (default) and offline.
- **§3 Runtime** — diagram should not mention a build step.
- **§5 Key Files** — Dockerfile is no longer user-facing but is still
  authoritative for the published image.

Add a new **§7 Image publication**:

- GHCR coordinates and tag scheme.
- The CI workflow.
- How `BOT_IMAGE` flows from `docker.js` → generated `docker-compose.yml`.
- The `MOJULO_OFFLINE_BUILD` escape hatch.

---

## File-by-file change list

| File | Phase | Change |
|---|---|---|
| [lite-template/Dockerfile](lite-template/Dockerfile) | 1 | Drop `--platform=linux/amd64` from `FROM` line |
| [.github/workflows/publish-bot-image.yml](.github/workflows/publish-bot-image.yml) | 3 | New file — CI publish workflow |
| [control/lib/deployers/docker.js](control/lib/deployers/docker.js) | 4 | Add `BOT_IMAGE` + `OFFLINE_BUILD` constants; rewrite `buildDockerCompose`; add `PREBUILT_EXCLUDES`; thread mode into `copyTemplateFiles`; update `buildReadme` copy |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 7 | Refresh §2, §3, §5; add §7 |

---

## Open risks

1. **GHCR package-visibility footgun.** If Phase 2 step "mark package public"
   is skipped, every user gets `403 unauthorized` on pull. Mitigation: smoke
   test from a logged-out machine (or `docker logout ghcr.io` first) before
   declaring success.
2. **arm64 build surprises.** `better-sqlite3` compiling under emulation in CI
   takes longer than amd64. If CI build time becomes a problem, add a matrix
   strategy with one runner per arch and fan-in via
   `docker manifest create`. Not worth doing preemptively.
3. **First-time-pull latency on slow connections.** ~XXX MB pull (TBD; measure
   in Phase 2). Still strictly faster than the current build path. README copy
   should set expectations honestly.
4. **Offline-build path drift.** The build-from-source path will get exercised
   less and could rot. Mitigation: keep at least one CI job that runs the
   offline path end-to-end on every PR touching `lite-template/` or
   `docker.js`.

---

## What's needed from you

- [ ] PAT with `write:packages` for the manual Phase 2 publish (one-time).
- [ ] Run the `docker login` + `docker buildx build --push` commands.
- [ ] Click "Change visibility → Public" on the GHCR package page.
- [ ] Smoke-test the test image works.
- [ ] After Phase 3 lands: run `git tag bot-v0.1.0 && git push --tags`.

Everything else is local code edits I can do.
