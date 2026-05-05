# Mojulo-Lite

> Compile your own AI chatbot into a portable Docker artifact. Self-host it anywhere `docker compose up` runs — your laptop, a $5 VPS, or one-click to Fly.io.

Two ways to build a bot, one shape of output:

- **Chat builder** — describe what you want, Claude proposes, you dispose.
- **Wizard** — step-by-step form for when you already know.

Both produce a `<bot>.zip`. One image, one config, one command.

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

## Why

Most chatbot builders trap you in their cloud. You get a hosted widget, a recurring bill, and zero ownership.

Mojulo-Lite hands you the artifact. The bot you compile is yours — its source is one open-source image, its config is plain JSON, its conversations live in a SQLite file you control. Move it, fork it, audit it, run it offline. The control plane is just the factory; the bot doesn't phone home.

## Features

- **Two builders, same output.** Conversational builder for vibes, structured wizard for precision.
- **Six LLM providers.** Anthropic, OpenAI, Gemini, Cohere, AWS Bedrock — pick at build time, swap by editing `.env`.
- **Multilingual vector RAG, fully offline.** Knowledge documents and triage routes are embedded with `multilingual-e5-small` ONNX baked into the bot image. No embedding-API key required at runtime.
- **Protocol cartridges.** Mix and match: knowledge retrieval, ghost-form gathering (the bot collects structured data without a form UI), appointment scheduling, triage routing.
- **Connect Bot.** Browse live conversations from the control plane without exporting a database — the bot's SQLite stays on the bot.
- **One-click cloud deploy** to Fly.io. Persistent volume, autostart on request, autostop when idle.
- **Tamper-evident transcripts.** Every turn is content-hashed and chain-linked; verify at `/verify/:id`. Chains continue across triage handoffs — the receiver's first turn descends from the sender's tip-of-chain, and the sender records the routing transition as a chained event row. See [docs/federated-routing.md](docs/federated-routing.md).
- **Embeddable widget** + Prometheus metrics + form-submission webhooks out of the box.

## Quickstart

```bash
git clone https://github.com/zombico/mojulo-lite.git
cd mojulo-lite/control
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3001` and:

1. **Settings → API Keys** — paste at least one LLM provider key. This powers the builder *and* gets baked into every bot you compile.
2. **Chat builder** or **Wizard** — describe the bot.
3. **My bots** — download the zip.
4. Unzip, paste your LLM key into `.env`, `docker compose up`. Bot is at `http://localhost:3000`.

That's it. Five minutes from clone to running bot.

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

### One-click to Fly.io

Configure a Fly API token in **Settings**, then hit **Deploy to cloud** on any bot. The control plane provisions the app, allocates a volume, injects your config, and waits for healthchecks — progress streams back live.

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

## Connect Bot: live conversations without exporting

Once a bot is running anywhere reachable (localhost, ngrok, Fly, your VPS), paste its URL into the dashboard. The control plane proxies through to the bot's read-only API using the API key both sides already share — conversation rows stay in the bot's SQLite, the control plane just forwards reads.

<!--
  IMAGE — Conversations browser.
  Recommended shot: the dashboard's conversations page for a connected bot,
  showing a list of conversations on the left, a selected conversation's
  turns on the right, and the green "Connected — last seen 2s ago" pill in
  the header.
  Why this shot: this is the operator superpower nobody else ships — your
  data on your bot, viewable from the factory without copying it.
  Suggested filename: docs/images/connect-bot-conversations.png
-->
![Connect Bot conversations browser](docs/images/connect-bot-conversations.png)

See [ARCHITECTURE.md §7](ARCHITECTURE.md) for the trust model.

---

## Architecture in one paragraph

The control plane is a Next.js app. The wizard or chat builder produces a deployment config (same shape both ways), then [DockerDeployer](control/lib/deployers/docker.js) composes a per-bot `instructions.txt` from protocol cartridges, bakes documents + triage routes into a `embeddings.json` vector index, and packages config + `docker-compose.yml` + `.env.example` into a zip. The runtime is a separate Express container ([lite-template/](lite-template/)) published to GHCR — pull it, mount the per-bot config, you have a bot. Cloud deploys go to Fly Machines, injecting the same config files via the Machines API instead of a zip.

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

- [docs/bot-frontend.md](docs/bot-frontend.md) — the bot's UI: standalone client, embeddable widget, control-plane preview shim — one HTML file, three surfaces, no build step
- [docs/vector-rag.md](docs/vector-rag.md) — how the in-process multilingual vector index is built and queried (knowledge + triage routes share one cosine index)
- [docs/form-collection.md](docs/form-collection.md) — ghost forms: locale-aware schema generated at build time, rendered on the client, submitted via a dedicated endpoint that bypasses the LLM (PII never reaches the model)
- [docs/conversations-api.md](docs/conversations-api.md) — Connect Bot: how the control plane proxies through to a running bot's conversations API without copying data
- [docs/turn-hashing.md](docs/turn-hashing.md) — per-turn `content_hash` + `chain_hash`, the single-bot tamper-evident chain that `/verify/:id` walks
- [docs/federated-routing.md](docs/federated-routing.md) — cross-bot tamper-evident chain across triage handoffs (extends turn-hashing across bot boundaries)

---

## Status & scope

This is a single-user, self-hosted application. The control plane has no auth — **don't expose it to the public internet**. Run it on `localhost`, behind a VPN, or in front of a reverse proxy with auth.

The bots it compiles, on the other hand, are designed to face users.

Currently versioned `0.x` — APIs and config shapes can change between minor versions. The artifact format and bot image are pinned to the control-plane version they were built with.

## Contributing

Issues and PRs welcome. Before opening a PR:

- Read [ARCHITECTURE.md](ARCHITECTURE.md) so we're working from the same picture.
- For non-trivial changes, open an issue first to align on scope.

## License

[MIT](LICENSE)
