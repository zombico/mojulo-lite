# Mojulo-Lite
Self-hosted AI chatbot builder. Hash-chained conversation logs, offline retrieval, portable artifacts.

> Compile a chatbot into a portable Docker artifact. Self-host it anywhere `docker compose up` runs — a laptop, a VPS, Fly.io, or an air-gapped host.

Three surfaces, one artifact:

- **Chat builder** — describe the bot you want; Claude drafts the config, you adjust.
- **Wizard** — step-by-step form for when you already know the shape you want.
- **MCP** — point Claude Code or Desktop at the control plane and your Claude drives the build loop, mixing mojulo's tools with your other MCP servers (Drive, Linear, Gmail, GitHub). See [docs/mcp-integration.md](docs/mcp-integration.md).

All three produce the same `<bot>.zip`.

<!--
  HERO IMAGE — put it here.
  Recommended shot: a side-by-side or single screenshot of the chat builder
  mid-conversation. The user has typed something like "I want a triage bot
  for a dental clinic" and Modulo (the avatar) is responding with proposed
  protocol toggles + a form schema in the side panel.
  Why this shot: it's the pitch in one frame — natural language in,
  structured bot config out.
  Suggested filename: docs/images/hero-chat-builder.png
  Width: 100% / aspect ~16:9
-->
![Chat builder hero shot](docs/images/hero-chat-builder.png)

---

## Features

- **Hash-chained transcripts.** Every turn is content-hashed and chain-linked; `/verify/:id` walks the chain. Chains continue across triage handoffs — the receiver's first turn descends from the sender's tip-of-chain, and the sender records the routing transition as a chained event row. See [docs/turn-hashing.md](docs/turn-hashing.md) and [docs/federated-routing.md](docs/federated-routing.md).
- **Multilingual vector RAG, offline at runtime.** Knowledge documents and triage routes are embedded with `multilingual-e5-small` ONNX baked into the bot image. Cross-language retrieval works without a language-detection step or an embedding-API key at runtime — e.g. a Thai query against a Spanish corpus. See [docs/vector-rag.md](docs/vector-rag.md).
- **Out-of-band forms — PII bypasses the LLM.** Locale-aware structured fields render client-side and submit through a dedicated endpoint that does not call the model. The chat history records only an opaque marker like `{contact_form_filled}`. See [docs/form-collection.md](docs/form-collection.md).
- **Image extraction with hashed inputs.** Name the slots you want out of an uploaded image (DOB, license #, expiry, prescription dose); a vision-capable LLM reads the artifact, the user reviews and edits before submit. The extraction turn is hashed over the image bytes, so post-hoc edits to the source image break the chain. See [docs/optical-read.md](docs/optical-read.md).
- **Live conversation viewer.** Read conversations from a deployed bot without copying data out of it. The bot's SQLite stays on the bot; the control plane proxies through a shared key. See [docs/conversations-api.md](docs/conversations-api.md).
- **Two builders, same output.** Conversational builder for fast iteration, structured wizard for precision.
- **Multiple LLM providers.** OpenAI, Anthropic, or local Ollama — pick at build time, swap by editing `.env`. Cloud providers and llama3.3 (70B, ~75GB resident) run every protocol; smaller local models (qwen3, mistral-nemo) are gated to knowledge-base bots, since the multi-step tool-use a forms/appointments/triage bot needs is unreliable on those models.
- **Composable protocols.** Mix and match: knowledge retrieval, form gathering, appointment scheduling, triage routing, image extraction.
- **Localized bot UI and form validation across 20 locales.** The chat widget and form error messages render in the user's language without operator configuration.
- **Cloud deploy to Fly.io.** Paste a token in Settings, click Deploy. Persistent volume, autostart on request, autostop when idle. No `flyctl` install required.
- **Document library.** Upload once, reuse across bots. Optionally bundle the source documents back into the artifact zip for archival or client handoff.
- **Embeddable widget**, Prometheus metrics, and form-submission webhooks.

## Why

Most chatbot builders are hosted SaaS — a managed widget, a recurring bill, no ownership of the artifact itself.

Mojulo-Lite produces a portable artifact instead. The bot you compile is yours: the source is a single open-source image, the config is plain JSON, conversations live in a SQLite file on the bot. The control plane builds it; the bot doesn't phone home.

## Who builds with this

A spectrum, all on the same open-source, self-hosted stack:

- **Indie makers** shipping a side-project bot without a SaaS bill — clone, compile, point at a small VPS.
- **Agencies** building a per-client bot per deployment, swapping LLM provider and locale per project.
- **Internal IT** rolling out an air-gapped helper inside a firewalled network — offline RAG means there's no embedding API to allow-list.
- **Regulated SMBs** — clinics, law offices, financial pre-screen — where the chained transcript can serve as a compliance artifact.
- **Claude Code / Desktop users** driving the control plane via MCP, composing mojulo's build and audit tools with the other MCP servers already in their loop. Recipes in [docs/mcp-integration.md](docs/mcp-integration.md).

Local `docker compose up` or cloud deploy to Fly.io from the dashboard — same artifact, your choice of host. The audit-chain and offline pieces are there when you need them, and stay out of the way when you don't.

## Quickstart

```bash
git clone https://github.com/zombico/mojulo-lite.git
cd mojulo-lite/control
cp .env.example .env
npm install         # first install fetches a 113MB ONNX model for offline RAG (~30–60s)
npm run dev
```

Open `http://localhost:3001` and:

1. **Settings → Provider Keys** — paste at least one LLM provider key (Anthropic / OpenAI), or point the wizard at a local Ollama host. Optionally add a Fly.io token in the same place to enable cloud deploy from the dashboard. The same store powers the builder, gets baked into compiled bots, and authenticates cloud deploys.
2. **Chat builder** or **Wizard** — describe the bot.
3. **My bots** — pick how to run your bot:
   - **Deploy to cloud** — ship it to Fly.io from the dashboard.
   - **Download zip** — paste the LLM key into `.env` and run `docker compose up` on your own host. The bot is at `http://localhost:3000`.

That's the loop: clone, configure, build, run.

<!--
  IMAGE — Wizard knowledge step.
  Recommended shot: the wizard's knowledge / RAG step with a couple of
  uploaded PDFs visible and the embedding progress bar mid-run, OR the
  triage step with a few destination bots configured.
  Why this shot: makes the "drag in your docs, get a vector index" story
  concrete. Pairs well with the "vector RAG, fully offline" bullet above.
  Suggested filename: docs/images/wizard-knowledge.png
-->
![Wizard knowledge step](docs/images/wizard-knowledge.png)

---

## Deploy options

### Locally (the default)

The downloaded zip pulls a pinned bot image from GHCR and runs it. No build step on your laptop:

```bash
unzip my-bot-{id}.zip && cd my-bot-{id}
# paste LLM key into .env
docker compose up
```

### Fly.io from the dashboard

Paste a Fly API token in **Settings → Provider Keys**, alongside your LLM key (encrypted at rest, same flow). Click **Deploy to cloud** on a bot from the dashboard. The control plane provisions the app, allocates a volume, injects your config, and waits for healthchecks while progress streams back. No `flyctl` install or local `.env` editing required. Your Fly account, your bill.

<!--
  IMAGE — Cloud deploy pane.
  Recommended shot: the deploy panel with the live progress log streaming
  ("Ensuring app…", "Allocating IPs…", "Waiting for machine to start…",
  "Deployed at https://abc1234-bot.fly.dev"). Status pill green.
  Why this shot: shows that cloud deploy isn't a stub — there's a real
  lifecycle behind it.
  Suggested filename: docs/images/cloud-deploy-progress.png
-->
![Cloud deploy progress](docs/images/cloud-deploy-progress.png)

### Air-gapped / your own registry

Set `MOJULO_OFFLINE_BUILD=1` on the control plane. The artifact bundles full source + Dockerfile and builds locally on the user's machine — no GHCR reachability required.

To point the prebuilt path at your own registry:

```bash
BOT_IMAGE=ghcr.io/your-org/your-bot:0.1.0   # control plane local build
MOJULO_CLOUD_IMAGE=ghcr.io/your-org/your-bot:0.1.0   # Fly cloud deploy
```

---

## Live conversation viewer

Once a bot is running anywhere reachable (localhost, ngrok, Fly, your VPS), paste its URL into the dashboard. The control plane reads conversations live, without copying them.

**How it works.** Every dashboard request to `/api/deployments/[id]/conversations*` and `/api/deployments/[id]/submissions*` is forwarded to the bot's read-only API, authenticated by `MOJULO_API_KEY` — a shared secret baked into the artifact at build time and stored alongside the bot's URL on the deployment row.

**What crosses the wire.** Read-only JSON responses: turn lists, hash chains, verification status, form submissions. **What doesn't.** No DB rows are replicated into the control plane, no bot-side write paths are exposed, no background sync runs. The bot's SQLite is the system of record; the control plane is a viewer.

**Why this matters for residency.** Conversation records — including PII captured by out-of-band forms — stay wherever the bot runs. If you deploy the bot inside a customer's VPC or a country-specific region, the data does not leave that boundary when you open the dashboard.

<!--
  IMAGE — Conversations browser.
  Recommended shot: the dashboard's conversations page for a connected bot,
  showing a list of conversations on the left, a selected conversation's
  turns on the right, and the green "Connected — last seen 2s ago" pill in
  the header.
  Why this shot: shows the read-through model — data on the bot, viewable
  from the control plane without copying it.
  Suggested filename: docs/images/connect-bot-conversations.png
-->
![Conversations browser](docs/images/connect-bot-conversations.png)

See [ARCHITECTURE.md §7](ARCHITECTURE.md) for the trust model.

---

## Security & deployment posture

The control plane ships with an **opt-in HTTP login** as a last-line-of-defense affordance. Set `CONTROL_PLANE_USER` and `CONTROL_PLANE_PASSWORD` in `control/.env` to enable it; leave them blank to preserve the historical no-auth default. Sessions are HMAC-signed with the password itself, so rotating the password invalidates every outstanding session with no extra bookkeeping. The login is intentionally minimal — no MFA, no lockout, no multi-user — and should not be treated as a substitute for network isolation. Pick the gating that matches your environment:

- **Run on `localhost`** (the default). Bind to `127.0.0.1`, never expose port 3001. This is the right posture for "build a bot on my laptop, ship the artifact."
- **Tailscale / WireGuard / VPN.** Reach the control plane only from your tailnet or VPN. Zero-config, works offline, no public surface.
- **SSH tunnel.** `ssh -L 3001:localhost:3001 your-host` for occasional remote access to a server install.
- **Reverse proxy with auth in front.** Caddy, nginx, or Traefik with basic auth — or OAuth2 Proxy, Cloudflare Access, Authelia, Tailscale Funnel. The control plane never sees the auth; your proxy enforces it.

**The bots it compiles have a different posture** — they're designed to face end users. The control plane → bot read-through proxy is authenticated by a key both sides share (`MOJULO_API_KEY`, baked into the artifact at build time), and conversation data stays in the bot's local SQLite.

For the threat model and what does or doesn't count as a security issue, see [SECURITY.md](SECURITY.md).

---

## Audit chain posture

The per-turn hash chain (`content_hash` + `chain_hash`, walked by `/verify/:id`) is **tamper-evident, not tamper-proof**. It catches naive retroactive edits to the bot's SQLite — change one row, the chain breaks at every row after it. It does **not** stop a sophisticated operator with DB access from rebuilding a coherent forged history from scratch; there is no signing key and no external anchor.

If your threat model demands non-repudiation against the bot operator themselves, you need an external anchor — **RFC 3161 timestamping**, **OpenTimestamps (Bitcoin anchoring)**, or an **external witness server** that records chain tips out of band. None of these are shipped today; the federated-routing handoff is the existing externalization surface where a pluggable witness sink would land. See [docs/turn-hashing.md](docs/turn-hashing.md) for the full scope statement.

---

## Architecture in one paragraph

The control plane is a Next.js app. The wizard or chat builder produces a deployment config (same shape both ways), then [DockerDeployer](control/lib/deployers/docker.js) composes a per-bot `instructions.txt` from protocol cartridges, bakes documents + triage routes into a `embeddings.json` vector index, and packages config + `docker-compose.yml` + `.env.example` into a zip.

The runtime is a separate Express container ([lite-template/](lite-template/)) published to GHCR — pull it, mount the per-bot config, you have a bot. Cloud deploys go to Fly Machines, injecting the same config files via the Machines API instead of a zip.

Full diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Repo layout

```
mojulo-lite/
├── control/        Next.js control plane: builders, wizard, dashboard, deploy pipeline
├── lite-template/  The bot itself: Express server, RAG, LLM client, Dockerfile
└── ARCHITECTURE.md How it all fits together
```

Per-package docs:

- [control/README.md](control/README.md) — running the control plane in dev
- [lite-template/](lite-template/) — bot runtime internals

Concept docs:

- [docs/mojulo-bots.md](docs/mojulo-bots.md) — **start here:** plain-language orientation to bots, protocols, and the Control Plane before diving into the deep dives below
- [docs/wizard-builder.md](docs/wizard-builder.md) — the structured wizard: how steps are generated from protocol toggles, how the live preview runs the real bot client, and how its output converges with the chat builder at `buildDeploymentConfig`
- [docs/chat-builder.md](docs/chat-builder.md) — the conversational builder: the tools Claude orchestrates, intent evaluation, and the streaming tool loop with custom event overlays
- [docs/vector-rag.md](docs/vector-rag.md) — how the in-process multilingual vector index is built and queried (knowledge + triage routes share one cosine index)
- [docs/turn-hashing.md](docs/turn-hashing.md) — per-turn `content_hash` + `chain_hash`, the single-bot hash chain that `/verify/:id` walks


## What this isn't

Mojulo-Lite is for building specialized bots over focused document sets. The in-process vector search is linear over the corpus — at very large scale, you'd want a dedicated vector database. The control plane is single-user by design. The artifact format may change between 0.x versions.

## Status

Currently versioned `0.x` — APIs and config shapes can change between minor versions. The artifact format and bot image are pinned to the control-plane version they were built with.


## Contributing

**One maintainer, no SLA.** Issues and PRs are read, but triage and review can
take days or weeks depending on what's already in flight — a non-trivial PR may
sit until I've had time to catch up on the surfaces it touches. Opening an issue
first, even for a one-line PR, is the fastest path to a decision: it lets the
scope conversation happen before the code does, so nobody's work waits in the
queue for a "no, retarget that."

The codebase is functionally modular but tightly integrated — a change to the
envelope schema, the cartridge composer, or a deployer touches multiple surfaces
(control plane wizard, bot runtime, locales, model gates). That integration
density is load-bearing for the artifact-portability and audit-chain guarantees,
and it's also the reason contribution policy is channeled by surface rather than
open across the board.

**Always welcome — open an issue:**
- Bug reports with a reproducer (especially RAG/locale/cartridge edge cases)
- Translation quality issues (any locale, any string)
- Documentation gaps or errors
- Questions about whether something should be a PR

**Accepted as PRs with the standard bar:**
- Bug fixes with a clear reproducer (for non-obvious bugs, file an issue first so we can align on scope before you write the code)
- Documentation fixes
- Locale string fixes
- Test additions that target the surfaces listed in [CONTRIBUTING.md](CONTRIBUTING.md#test-surface)

**Forking & extending the platform:**
- Custom protocols (your bot's specific behavior shape)
- New provider adapters
- Bespoke wizard flows or steps
- Anything narrow to a client, vertical, or workflow

These belong in forks — the upstream repo stays abstract so the artifact format
and audit guarantees stay stable. See
[docs/protocol-composition.md#adding-a-new-protocol](docs/protocol-composition.md#adding-a-new-protocol)
for the recipe; it works whether you keep changes in your fork or, for
capabilities with broad applicability, eventually propose them upstream.

Before opening a PR, read [ARCHITECTURE.md](ARCHITECTURE.md) so we're working
from the same picture, and see [CONTRIBUTING.md](CONTRIBUTING.md) for the test
surface, file layout, and pre-submit checklist.

## License

[Apache License 2.0](LICENSE)
