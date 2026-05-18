# Mojulo

You want a triage bot for your dental practice — one that answers basic questions from your intake docs, collects new-patient fields without piping PII through the LLM, and routes anything urgent to the on-call coordinator. You describe that to Claude in one sentence. Mojulo compiles `dental-triage-{id}.zip`. You `docker compose up`. Conversations start accumulating in a SQLite file on the bot, hash-chained turn by turn.

The whole loop — describe, compile, deploy, read back what was captured, automate the followup — runs in a Claude session. Mojulo's MCP server composes alongside the other MCP servers you already have installed (Drive, Gmail, your CRM), so the bot you just built can route new submissions into the rest of your toolchain without leaving the agent loop. That's the part most other chatbot builders don't do.

The bot's config — what mojulo writes into the zip and the bot reads at start — is plain JSON:

```json
{
  "name": "dental-triage",
  "identity": { "name": "Smile Clinic Assistant", "tone": "warm, plainspoken" },
  "enabledProtocols": { "knowledge": true, "formGathering": true, "triage": true },
  "formGathering": { "fields": ["full_name", "dob", "insurance_carrier", "chief_complaint"] },
  "triage": { "routes": [{ "label": "urgent — on-call coordinator", "destination": "..." }] }
}
```

You can edit it, you can `cat` it, you can move the bot to another host by copying the zip. The bot is yours.

<!--
  HERO IMAGE — put it here.
  Recommended shot: Claude Code or Claude Desktop mid-tool-call against
  mojulo. Ideally `forward_context` → `infer_intent` → `save_modular_bot`
  in the transcript, with a fragment of the resulting deployment row
  visible in the dashboard. The pitch is "Claude drives the loop"; the
  image has to read that way at a glance.
  Suggested filename: docs/images/hero-mcp-loop.png
  Width: 100% / aspect ~16:9
-->
![MCP-driven build loop](docs/images/hero-mcp-loop.png)

The control plane is usable via **app** and via **MCP** — two surfaces over the same encrypted config:

- **MCP.** Point Claude Desktop or Claude Code at mojulo and your Claude drives the build/deploy/operate loop, composing mojulo's tools with the rest of your MCP servers. See [docs/mcp-integration.md](docs/mcp-integration.md).
- **App.** Browser dashboard at `localhost:3001`. Paste your LLM and Fly.io API keys here — they get AES-encrypted at rest, and your Claude never sees them; the MCP tools just consume them out of the store. The app also hosts a step-by-step wizard (and a conversational in-app builder) if you'd rather click through a build than describe it.

Both produce the same `<bot>.zip`.

---

## Quickstart

### MCP

```bash
# 1. Wire mojulo into Claude (Claude Code or Claude Desktop)
claude mcp add mojulo --command "npx -y mojulo"

# 2. Configure at least one LLM provider key.
#    Safer: paste it in the app's Settings → Provider Keys page (below).
#    The CLI works too, but the key lands in your shell history:
npx -y mojulo config set anthropic sk-ant-...

# 3. In a Claude session, ask:
#    "build me a triage bot for my dental practice"
```

Compiled bots land in `~/.mojulo/data/artifacts/`. Run them with `docker compose up`, or set a Fly token (`mojulo config set fly fo1_...`) and ask Claude to deploy to the cloud.

When Claude first connects, it calls `forward_context` to read mojulo's concept glossary, lifecycle, and tool index — so the first session orients itself before doing anything destructive.

### App

To run the app (Settings UI for key paste, wizard, in-app builder, and the optional HTTP MCP route for remote clients):

```bash
git clone https://github.com/zombico/mojulo.git
cd mojulo/control
cp .env.example .env
npm install         # postinstall fetches a 113MB ONNX model for offline RAG (~30–60s)
npm run dev         # http://localhost:3001
```

Paste an LLM provider key under **Settings → Provider Keys**. To enable HTTP MCP for a remote Claude, also set `CONTROL_PLANE_MCP_KEY` in `control/.env` — see [docs/mcp-integration.md](docs/mcp-integration.md).

---

## The loop: build → deploy → connect → operate

**Build.** A bot's capabilities are called **protocols** — five of them ship: `knowledge` (in-process RAG), `formGathering` (structured field capture, PII bypasses the LLM), `appointments`, `triage` (cross-bot routing), `opticalRead` (vision-based extraction). To build a bot, pick which protocols it needs, upload any documents it should know from, and compose its identity. From Claude, describe the bot in free text and the build tools sequence themselves starting at `infer_intent`; in the app, the wizard or in-app builder walks the same steps.

**Deploy.** `save_modular_bot` compiles the configured bot into a zip artifact. Run it locally (`docker compose up`), in the cloud (Fly.io from the dashboard or via MCP), or air-gapped with the source bundled in. The container image is bot-agnostic — per-bot config is injected at start time, so the same image runs every bot you have.

**Connect.** Once a bot starts, it phones home to the control plane with its URL. From then on the control plane can reach it through a bearer-authenticated proxy. **Conversation data stays in the bot's SQLite forever** — the control plane only stores `url` and `last_seen_at`. Any tool that needs transcript content proxies through to the bot in real time.

**Operate.** Read what bots have captured (`query_conversations`, `query_submissions`, `verify_chain`) or use catalysts — curated workflow recipes — to turn that captured signal into action via your other installed MCPs.

---

## What you get

Two terms recur below: **protocols** are the bot capabilities defined in *The loop* above (knowledge, form-gathering, appointments, triage, optical-read); **catalysts** are curated workflow recipes that Claude reads and turns into local skills in your `.claude/skills/`. Full glossary in [docs/mojulo-bots.md](docs/mojulo-bots.md).

### As an MCP server

- **Composable with the rest of your toolchain.** Drive folder → bot knowledge base. Linear escalations → triage routes. Intake submissions → CRM contact + welcome email + ticket. None of this is reachable from the in-app builders, because they can't see your other MCPs. See the recipes in [docs/mcp-integration.md](docs/mcp-integration.md).
- **Catalysts.** `list_catalysts` exposes curated patterns — `qualify-lead-to-crm`, `appointment-to-calendar`, `submission-to-ticket`, `scan-conversations-for-signal`, `weekly-submissions-digest`, `knowledge-gap-miner`. Claude reads one, binds it to a destination MCP you already have installed, and writes a local skill into `.claude/skills/`. The catalyst stays in mojulo; the resulting skill is yours. See [docs/catalysts.md](docs/catalysts.md).
- **The reasoning bill moves to your Claude.** When you drive it from MCP, the control plane doesn't need an Anthropic key for builder-time work — your Claude is the agent loop. The in-loop LLM calls that *do* stay server-side (form generation, identity composition, bot summary) use whichever provider you configured.

### As an artifact

- **Hash-chained transcripts.** Every turn is content-hashed and chain-linked; `/verify/:id` walks the chain. Chains continue across triage handoffs — the receiver's first turn descends from the sender's tip-of-chain. Image-extraction turns hash over the image bytes, so post-hoc edits to the source image break the chain. See [docs/turn-hashing.md](docs/turn-hashing.md) and [docs/federated-routing.md](docs/federated-routing.md).
- **Multilingual vector RAG, fully offline at runtime.** Knowledge documents and triage routes are embedded with `multilingual-e5-small` ONNX baked into the bot image. Cross-language retrieval works without a language-detection step or an embedding-API key — e.g. a Thai query against a Spanish corpus. See [docs/vector-rag.md](docs/vector-rag.md).
- **Out-of-band forms — PII bypasses the LLM.** Locale-aware structured fields render client-side and submit through a dedicated endpoint that doesn't call the model. The transcript records only an opaque marker like `{contact_form_filled}`. See [docs/form-collection.md](docs/form-collection.md).
- **Image extraction with hashed inputs.** Name the slots you want out of an uploaded image (DOB, license #, expiry, prescription dose); a vision-capable LLM reads the artifact, the user reviews and edits before submit. See [docs/optical-read.md](docs/optical-read.md).
- **Multiple LLM providers.** OpenAI, Anthropic, or local Ollama — pick at build time, swap by editing `.env`. Cloud providers and llama3.3 (70B) run every protocol; smaller local models (qwen3, mistral-nemo) are gated to knowledge-only bots since multi-step tool use is unreliable on them.
- **Localized bot UI and form validation across 20 locales** — the chat widget and form error messages render in the user's language without operator configuration.
- **Embeddable widget, Prometheus metrics, form-submission webhooks.**

---

## Why

Most chatbot builders are hosted SaaS — a managed widget, a recurring bill, no ownership of the artifact itself. The bot is something they run for you.

Mojulo produces an artifact instead. The bot you compile is yours: the source is a single open-source image, the config is plain JSON, conversations live in a SQLite file on the bot. The control plane builds it; the bot doesn't phone home for inference; the dashboard reads conversations live without copying them. And because mojulo is MCP-native, the build/deploy/operate loop is something **your** Claude drives — not a UI you log into to click around.

## Who builds with this

A spectrum, all driving the same open-source, self-hosted stack from their own Claude:

- **Indie makers** shipping a side-project bot without a SaaS bill — describe it once, point the resulting artifact at a small VPS.
- **Agencies** building a per-client bot per deployment, swapping LLM provider and locale per project, then wiring each client's bot into that client's CRM in the same agent session.
- **Internal IT** rolling out an air-gapped helper inside a firewalled network — offline RAG means there's no embedding API to allow-list.
- **Regulated SMBs** — clinics, law offices, financial pre-screen — where the tamper-evident transcript provides an internal audit trail (see [Audit chain posture](#audit-chain-posture) below for what's guaranteed and what isn't).

---

## Deploy options

### Locally (default)

The compiled zip pulls a pinned bot image from GHCR and runs it. No build step on your laptop:

```bash
unzip my-bot-{id}.zip && cd my-bot-{id}
# paste LLM key into .env
docker compose up
```

### Fly.io

Configure a Fly API token (`mojulo config set fly fo1_...`, or paste it in **Settings → Provider Keys**), then deploy from the dashboard or ask Claude to deploy via MCP. Persistent volume, autostart on request, autostop when idle. No `flyctl` install required. Your Fly account, your bill.

### Air-gapped / your own registry

Set `MOJULO_OFFLINE_BUILD=1` on the control plane. The artifact bundles full source + Dockerfile and builds locally on the target machine — no GHCR reachability required.

To point the prebuilt path at your own registry:

```bash
BOT_IMAGE=ghcr.io/your-org/your-bot:0.1.0           # control plane local build
MOJULO_CLOUD_IMAGE=ghcr.io/your-org/your-bot:0.1.0  # Fly cloud deploy
```

---

## Security & deployment posture

The control plane is **single-user, self-hosted**. Two access-control affordances, both opt-in:

- **HTTP login** (for the dashboard UI). Set `CONTROL_PLANE_USER` + `CONTROL_PLANE_PASSWORD` in `control/.env`. Sessions are HMAC-signed with the password itself, so rotating the password invalidates every outstanding session with no extra bookkeeping. Intentionally minimal — no MFA, no lockout, no multi-user — and not a substitute for network isolation.
- **MCP bearer token** (for HTTP MCP). Set `CONTROL_PLANE_MCP_KEY` to enable `/api/mcp`; with the key unset, the route 404s and the surface is invisible. One token, one user. The stdio transport (`npx -y mojulo`) is local-only and doesn't use this key.

**Network posture:** don't expose the control plane to the public internet. Pick whichever fits:

- **Run on `localhost`** (the default). Right for "build a bot on my laptop, ship the artifact."
- **Tailscale / WireGuard / VPN.** Reach the control plane only from your tailnet.
- **SSH tunnel.** `ssh -L 3001:localhost:3001 your-host` for occasional remote access.
- **Reverse proxy with auth in front.** Caddy, nginx, Traefik with basic auth — or OAuth2 Proxy, Cloudflare Access, Authelia, Tailscale Funnel.

**The bots it compiles have a different posture** — they're designed to face end users. The control plane → bot read-through proxy is authenticated by a key both sides share (`MOJULO_API_KEY`, baked into the artifact at build time), and conversation data stays in the bot's local SQLite.

For the threat model and what does or doesn't count as a security issue, see [SECURITY.md](SECURITY.md).

---

## Audit chain posture

The per-turn hash chain (`content_hash` + `chain_hash`, walked by `/verify/:id`) is **tamper-evident, not tamper-proof**. It catches naive retroactive edits to the bot's SQLite — change one row, the chain breaks at every row after it. It does **not** stop a sophisticated operator with DB access from rebuilding a coherent forged history from scratch; there is no signing key and no external anchor.

If your threat model demands non-repudiation against the bot operator themselves, you need an external anchor — **RFC 3161 timestamping**, **OpenTimestamps (Bitcoin anchoring)**, or an **external witness server** that records chain tips out of band. None of these are shipped today; the federated-routing handoff is the existing externalization surface where a pluggable witness sink would land. See [docs/turn-hashing.md](docs/turn-hashing.md) for the full scope statement.

---

## Architecture in one paragraph

The control plane is a Next.js app exposing both a dashboard and an MCP server (stdio for the npm package, HTTP for remote clients).

Builder tools — driven from your Claude over MCP or from the in-app chat builder / wizard — produce a deployment config (same shape regardless of entry point). From there, [DockerDeployer](control/lib/deployers/docker.js) composes a per-bot `instructions.txt` from protocol cartridges, bakes documents + triage routes into an `embeddings.json` vector index, and packages config + `docker-compose.yml` + `.env.example` into a zip.

The runtime is a separate Express container ([lite-template/](lite-template/)) published to GHCR — pull it, mount the per-bot config, you have a bot. Cloud deploys go to Fly Machines, injecting the same config files via the Machines API instead of a zip.

The dashboard reads conversations from connected bots live, through a bearer-authenticated proxy — transcript rows never get replicated into the control-plane DB.

Full diagrams: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Repo layout

```
mojulo/
├── control/        Next.js control plane: MCP server, dashboard, builders, deploy pipeline
├── lite-template/  The bot itself: Express server, RAG, LLM client, Dockerfile
└── ARCHITECTURE.md How it all fits together
```

Per-package docs: [control/README.md](control/README.md) — running the control plane in dev. [lite-template/](lite-template/) — bot runtime internals.

Concept docs (start with the first three):

- [docs/mojulo-bots.md](docs/mojulo-bots.md) — plain-language orientation to bots, protocols, and the control plane
- [docs/mcp-integration.md](docs/mcp-integration.md) — the MCP surface, the composition recipes, the session model
- [docs/catalysts.md](docs/catalysts.md) — what a catalyst is and how to author one
- [docs/wizard-builder.md](docs/wizard-builder.md), [docs/chat-builder.md](docs/chat-builder.md) — the in-app build paths
- [docs/vector-rag.md](docs/vector-rag.md), [docs/turn-hashing.md](docs/turn-hashing.md), [docs/federated-routing.md](docs/federated-routing.md) — the artifact properties
- [docs/form-collection.md](docs/form-collection.md), [docs/optical-read.md](docs/optical-read.md), [docs/conversations-api.md](docs/conversations-api.md) — capture & read paths

---

## Contributing

**One maintainer, no SLA.** Issues and PRs are read, but triage and review can take days or weeks depending on what's already in flight — a non-trivial PR may sit until I've had time to catch up on the surfaces it touches. Opening an issue first, even for a one-line PR, is the fastest path to a decision: it lets the scope conversation happen before the code does, so nobody's work waits in the queue for a "no, retarget that."

The codebase is functionally modular but tightly integrated — a change to the envelope schema, the cartridge composer, a deployer, or the MCP tool surface touches multiple surfaces (control plane wizard, bot runtime, locales, model gates, catalyst contracts). That integration density is load-bearing for the artifact-portability and audit-chain guarantees, and it's also the reason contribution policy is channeled by surface rather than open across the board.

**Always welcome — open an issue:**
- Bug reports with a reproducer (especially RAG/locale/cartridge/MCP edge cases)
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
- Custom catalysts that don't merit promotion to the canonical library
- Anything narrow to a client, vertical, or workflow

These belong in forks — the upstream repo stays abstract so the artifact format and audit guarantees stay stable. See [docs/protocol-composition.md#adding-a-new-protocol](docs/protocol-composition.md#adding-a-new-protocol) for the protocol recipe and [docs/catalysts.md](docs/catalysts.md) for the catalyst author spec.

Before opening a PR, read [ARCHITECTURE.md](ARCHITECTURE.md) so we're working from the same picture, and see [CONTRIBUTING.md](CONTRIBUTING.md) for the test surface, file layout, and pre-submit checklist.

## License

[Apache License 2.0](LICENSE)
