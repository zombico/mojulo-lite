# Mojulo Bots

A short orientation to the system. For mechanics, follow the deep-dive links at the bottom of each section.

---

## What is a Mojulo Bot?

A Mojulo Bot is a containerized AI chat application, configured at build time by a fixed set of instructions (**protocols**) and capabilities. Once built, it runs autonomously on any Docker-enabled cloud service or VPS — the only external dependency is an API key for whichever LLM provider you point it at.

A bot embeds into any website with a single `<script>` tag that injects a collapsible chat widget.

See: [bot-frontend.md](bot-frontend.md).

---

## What do Mojulo Bots do?

The default capability is **conversational FAQ** — an answer engine that matches the user's question against a private knowledge base via in-process vector search, multilingual out of the box.

That capability stacks with optional protocols:

- **Form gathering** — collect structured information through natural conversation, with webhook delivery on completion.
- **Optical read** — extract user-defined fields from an uploaded image (license, prescription label, business card, receipt) using a vision-capable LLM.
- **Appointments** — surface a calendar booking link when the user expresses booking intent.
- **Triage routing** — hand the user off to a different Mojulo Bot when their intent falls outside the current bot's scope.

A single bot can mix multiple protocols — a clinic-intake bot might combine knowledge + forms + appointments. It's also possible to compose a federated network of single-purpose bots that route to each other.

Every conversation turn is recorded in the bot's local SQLite database, content-hashed and chain-linked so any after-the-fact edit is detectable. Triage handoffs extend the chain across bots, so a user's journey through the network is end-to-end tamper-evident.

See: [protocol-composition.md](protocol-composition.md), [vector-rag.md](vector-rag.md), [form-collection.md](form-collection.md), [optical-read.md](optical-read.md), [federated-routing.md](federated-routing.md), [turn-hashing.md](turn-hashing.md).

---

## What is the Control Plane?

A wizard builder and observability dashboard for Mojulo Bots. It runs locally or on your own private cloud, single-user, with an opt-in login as a last-line-of-defense affordance — it is the operator's tool, not a tenant-facing service.

The Control Plane has two jobs:

1. **Build bots.** A chat builder (Claude tool-use over SSE) and a step-by-step wizard both produce the same deployment artifact — a portable zip containing config, an `instructions.txt` composed from the enabled protocols, and a baked vector index.
2. **Connect to live bots.** Once a built bot is running anywhere reachable, paste its URL on the deployment row and the dashboard proxies through to it.

Once the Control Plane is set up, building and configuring bots does not require coding or DevOps knowledge.

See: [chat-builder.md](chat-builder.md), [wizard-builder.md](wizard-builder.md).

---

## What happens when you link a Mojulo Bot to the Control Plane?

The Control Plane proxies into the bot's read-only endpoints using a shared API key that was baked into the artifact's `.env` at build time. Through that proxy the operator can:

- Browse conversation transcripts.
- Inspect form submissions.
- View extracted fields from optical-read turns.
- Verify the tamper-evident chain on any conversation.

Conversation data is **never copied into the Control Plane database**. The Control Plane stores only the bot's URL and a `last_seen_at` timestamp on the deployment row. Disconnect the bot, move it, take it offline — the data stays on the bot's disk, and reconnecting picks back up wherever the bot's chain currently sits.

See: [conversations-api.md](conversations-api.md).
