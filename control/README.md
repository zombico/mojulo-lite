# Mojulo-Lite · Control Plane

A standalone Next.js app that compiles bots into portable Docker artifacts.

Two ways in:

- **Chat builder** (`/chat-builder`) — "Claude proposes, you dispose." The hero feature.
- **Wizard** (`/bot-factory/modular`) — step-by-step for when you know what you want.

Both produce the same output: a `<bot>.zip` containing `docker-compose.yml`, composed `instructions.txt`, and all protocol config. One image (`mojulo/bot:latest`), one config zip, one `docker compose up`.

## Quick start

```bash
cd control
cp .env.example .env
npm install
npm run dev
```

Then open http://localhost:3001:

1. Visit **Settings** and add your LLM provider API key (Anthropic, OpenAI, Gemini, Cohere, or Bedrock). This key powers the conversational builder AND gets baked into every bot you compile.
2. Open **Chat builder** or **Wizard** and describe the bot you want.
3. When it's done, grab the `.zip` from **My bots**.
4. Unzip, edit `.env` (paste your LLM key), run `docker compose up`. Bot lives on `http://localhost:3000`.

## Layout

```
control/
├── app/                           # Next.js app router
│   ├── api/
│   │   ├── builder/stream/        # SSE endpoint powering the chat builder (Claude tool-use)
│   │   ├── deploy/                # Wizard POSTs here to compile a bot
│   │   ├── deployments/           # List / detail / download zip
│   │   ├── documents/             # Upload + parsed-text storage
│   │   └── settings/api-keys/     # CRUD over the single-user key vault
│   ├── chat-builder/              # Conversational builder UI (Claude tool-use inverted flow)
│   ├── bot-factory/modular/       # Classic wizard
│   ├── dashboard/                 # Bot list with download links
│   └── settings/                  # API key management
├── components/
│   ├── ModularChat/               # Chat panel + Modulo avatar (copied)
│   └── wizard/modular/            # Step-based wizard (copied)
├── lib/
│   ├── composer/                  # Protocol cartridges → instructions.txt
│   ├── config-builder.js          # Form → deployment config object
│   ├── deployers/docker.js        # The Lite deployer. Outputs the zip.
│   ├── builder/                   # Builder tools + executors (Claude tool-use; shared by chat builder and wizard)
│   ├── db/                        # SQLite schema + repositories
│   └── storage/                   # Local filesystem (replaces S3)
└── data/                          # Runtime state: sqlite db, storage, artifacts
```

## How compilation works

1. Wizard or conversational builder produces a deployment config (same shape the Full product uses).
2. `lib/composer/composer.js` composes `instructions.txt` from the enabled protocol files in `lib/composer/protocols/`.
3. `lib/deployers/docker.js` copies `../lite-template/` (the bot container source tree), writes `config/` + `documents/` + `docker-compose.yml` + `.env.example` + `README.md` into a staging dir, and zips it.
4. The zip is saved to `data/artifacts/` and linked to the deployment record in SQLite.
5. `/api/deployments/[id]/download` streams it back to the user.

## Env vars

See `.env.example`. The main knobs:

- `LITE_TEMPLATE_PATH` — path to the bot container source tree (defaults to `../lite-template`).
- `ARTIFACTS_DIR` — where `.zip` outputs get written.
- `BOT_IMAGE` — the Docker image the generated `docker-compose.yml` references.
- `API_KEY_ENCRYPTION_KEY` — used to encrypt stored LLM keys at rest. Leave unset for local dev; set it in production.

## Testing locally

1. Ensure `../lite-template/` exists (bot container source tree).
2. Build the bot image once: `npm run build:bot` (tags `mojulo/bot:latest`).
3. Start the control plane: `npm run dev`.
4. Add an API key, compile a bot, download the zip.
5. In the unzipped bot dir: paste your LLM key into `.env`, then `docker compose up`.
