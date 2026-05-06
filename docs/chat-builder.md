# Chat Builder

The chat builder is the conversational alternative to the [wizard](wizard-builder.md). The user types one message — "I want a triage bot for a dental clinic, here are some PDFs" — and Claude orchestrates the build by calling a fixed set of tools. Each tool is a deterministic handler: parse documents, infer intent, recommend protocols, generate a form schema, compose an identity, save the bot. Claude only decides the order and arguments. This doc explains those tool calls — what they do, when Claude calls them, and how their outputs feed each other.

The wizard's internals are out of scope here, but the convergence point is the same: both builders write a deployment config of the same shape into the same SQLite table, and both feed [DockerDeployer](../control/lib/deployers/docker.js) downstream.

---

## Why this shape

Three properties drive the design:

1. **Claude is the orchestrator, not the author.** Each step the user would manually click in the wizard becomes a tool. The handlers do the actual work — chunking documents, calling embedding models, generating form schemas, writing deployment rows. Claude picks which tools to call in what order, but never invents a config value from free-form text. This means a chat-builder bot's config is the typed output of the same handlers a wizard-builder bot would invoke; the two paradigms produce byte-equivalent artifacts because the work happens in the handlers, not in the LLM's prose.
2. **Two-tier intent evaluation gates the system prompt.** Before the main builder runs, a separate cheap Claude call (the [evaluator](../control/lib/builder/evaluator.js)) classifies the user's message as either *high assistance* (vague request — guided flow) or *low assistance* (detailed spec — direct orchestration). Heuristics in [shouldSkipEvaluation](../control/lib/builder/evaluator.js#L144) short-circuit the obvious cases without an LLM call (≤10 words + docs = high; ≥100 words = low). The main builder gets a different system prompt depending on the result, so a power user with a 200-word spec doesn't get walked through "what's a knowledge base?"
3. **Streaming with structured event overlays.** The route is Server-Sent Events end-to-end. On top of Claude's own SSE, the route emits 20+ custom event types — `tool_started`, `tool_completed`, `protocols_recommended`, `identity_composed`, `modulo_expression` — so the UI can react to specific milestones (advance a stepper, animate the Modulo avatar, surface a confirmation card) without re-parsing model text. The text channel and the event channel are independent.

---

## Architecture

```
                       User message + (optional) docs
                                    │
                                    ▼
                  ┌─────────────────────────────────┐
                  │ shouldSkipEvaluation (heuristic)│
                  └────────────┬────────────────────┘
                               │ skip? ───────────────► default level
                               │ no
                               ▼
                  ┌─────────────────────────────────┐
                  │ evaluateIntent (separate Claude │
                  │ call, cheap, no docs read)      │
                  │ → high|low + extracted context  │
                  └────────────┬────────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────────┐
                  │ buildBuilderSystemPrompt        │
                  │ (branches by assistance level)  │
                  └────────────┬────────────────────┘
                               │
                               ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                     TOOL LOOP (≤ 10 iterations)             │
   │                                                             │
   │  POST /v1/messages  ─►  Claude streams text + tool_use      │
   │                              │                              │
   │                              ▼                              │
   │              ┌──────────────────────────┐                   │
   │              │ executeBuilderTool(name) │                   │
   │              │  → builderToolHandlers   │                   │
   │              └──────────┬───────────────┘                   │
   │                         │                                   │
   │                         ▼                                   │
   │           tool_result appended to messages                  │
   │                         │                                   │
   │                         ▼                                   │
   │       Loop until Claude returns no more tool_use blocks     │
   └─────────────────────────────────────────────────────────────┘
                               │
                               ▼
                       (User confirms in UI)
                               │
                               ▼
                       save_modular_bot tool
                       → writes deployment row
                       → triggers buildArtifact
```

The whole flow lives in [control/app/api/builder/stream/route.js](../control/app/api/builder/stream/route.js). The tool loop is capped at `MAX_TOOL_ITERATIONS = 10` with a 500 ms delay between iterations, and both the system prompt and the tool list use ephemeral prompt caching (`cache_control: { type: 'ephemeral' }`) so iterations after the first are cheap.

---

## The tool catalog

Ten tools, defined in [control/lib/builder/tools.js](../control/lib/builder/tools.js), implemented in [control/lib/builder/tool-executors.js](../control/lib/builder/tool-executors.js). Claude calls them in a canonical order spelled out in the system prompt:

| # | Tool                          | When                              | Produces                                    |
|---|-------------------------------|-----------------------------------|---------------------------------------------|
| 1 | `process_documents`           | Only if docs are attached         | Embeddings + a `domainDigest` summary       |
| 2 | `infer_intent`                | Always                            | Bot type classification + `prepopulatedSettings` extracted from message |
| 3 | `recommend_protocols`         | Always                            | Which of knowledge / forms / appointments / triage to enable, with reasoning |
| 4 | `generate_form_schema`        | If forms recommended              | Locale-aware ghost-form JSON (PII flags, field types, validators) |
| 5 | `generate_appointment_config` | If appointments recommended       | Calendar destinations + service types       |
| 6 | `generate_triage_config`      | If triage recommended             | Routing destinations matched against existing bots' `botSummary` |
| 7 | `compose_identity`            | Always                            | Bot name, objective, first message, display name, placeholder |
| 8 | `set_suggested_prompts`       | After `compose_identity`          | 3 prompts in the same language as the docs/user request |
| 9 | `generate_bot_summary`        | After `compose_identity` (parallel with #8) | Metadata describing the bot — used by *other* bots' triage routes |
| 10 | `save_modular_bot`           | Only after explicit user confirmation | Writes deployment row, kicks off build      |

### `process_documents`

The first tool whenever documents are attached. It reads each `documentId`, parses (PDF/DOCX/TXT/etc. via [document-parser](../control/lib/document-parser.js)), chunks into 512-character windows with 50-character overlap, and embeds the chunks locally with the bundled `multilingual-e5-small` ONNX model — the same model + prefix convention the bot uses at runtime, so corpus and query vectors share one geometric space. See [vector-rag.md](vector-rag.md) for the embedding pipeline.

Two outputs land on the session:
- **Embeddings blob** — written to `embeddings/wizard-{token}.json` in storage, referenced by `storageKey` so the deploy step doesn't have to re-embed.
- **`domainDigest`** — a build-time text summary of what's in the corpus. Downstream tools (`infer_intent`, `compose_identity`, `set_suggested_prompts`, `generate_triage_config`) read this string instead of re-reading the source documents. It's how the bot ends up with a first message that names the actual organization and a set of suggested prompts in the corpus's language.

### `infer_intent`

Classifies the bot type — `support_bot`, `lead_gen`, `appointment_scheduler`, `triage_router`, etc. — from `userMessage` + `domainDigest`. Returns a confidence score and, critically, a `prepopulatedSettings` object extracted from the user's prose by [extractPrepopulatedSettings](../control/lib/builder/tool-executors.js#L253). Patterns it recognizes: *"called X"*, *"named X"*, *"for [Company]"*, *"start with '...'"*. These get honored by `compose_identity` later, so an explicit "name it Aria" overrides the LLM's auto-name.

### `recommend_protocols`

Returns a recommendation map: `{ knowledge: bool, formGathering: bool, appointments: bool, triage: bool }`. The recommendation is *what should be enabled*, not *what is enabled* — the user confirms before `save_modular_bot` runs. The handler reasons from intent + digest + message, but the final say is the user's via the `confirmedProtocols` argument to `save_modular_bot`.

### `generate_form_schema`

Only called if forms were recommended and the user wants them. Generates the locale-aware schema described in [form-collection.md](form-collection.md): field types, regex patterns appropriate for the locale, GDPR hints, an `afterSubmitChatMessage`. The form JSON is what the bot client renders into ghost-form bubbles at runtime — PII never reaches the LLM, only an opaque `{contact_form_filled}` marker does.

### `generate_appointment_config`

Generates calendar destinations from the digest (e.g., a dental-clinic corpus suggests "Cleaning", "Consultation", "Emergency" appointment types) and a list of available calendar providers. Output ends up at `protocolData.appointments.destinations`.

### `generate_triage_config`

Builds routing destinations for handoffs to other bots. Distinctively, it consults the **existing bots in the workspace** — each existing deployment carries a `botSummary` (generated by tool #9 at *its* build time), and triage uses those summaries as the route descriptions for RAG matching. So when a user asks the parent bot something the sibling specializes in, the routing decision uses the sibling's own self-description as the matching corpus. See [federated-routing.md](federated-routing.md) for what these routes become at runtime, including the chain-hash continuation across the handoff.

### `compose_identity`

The "make this thing feel like a bot" step. Generates name, objective, first message, chat display name, placeholder text. Reads `userMessage`, `domainDigest`, `intent`, `enabledProtocols`, `organizationName`, and `prepopulatedSettings` (from #2). Explicit overrides win — if the user said "name it Aria", `compose_identity` honors that and only generates the rest.

### `set_suggested_prompts` (parallel with #9)

Called immediately after `compose_identity`. Sets the 3 starter prompts shown under the bot's first message. The system prompt is emphatic that these MUST be in the same language as the corpus/user — Korean docs → Korean prompts, Spanish → Spanish — and ≤8 words each, action-verb first. This is a separate tool from `compose_identity` because the localization heuristic is different: identity blends user message + corpus, but prompts should match the corpus's primary language even if the user wrote in English.

### `generate_bot_summary` (parallel with #8)

Called in parallel with `set_suggested_prompts`. Takes no arguments — it reads everything from the session. Produces a short summary of *what this bot does and what it knows*. The user does not see this directly. Its role is to be the route description that *other* bots' `generate_triage_config` will retrieve later when the operator builds a sibling bot. Bot summaries are how the multi-bot mesh self-organizes.

### `save_modular_bot`

The terminal tool. Only called after the user explicitly confirms — the system prompt forbids calling it preemptively. Takes `sessionId` + `confirmedProtocols` (the user's actual choices, which may differ from `recommend_protocols`'s suggestions). The handler:

1. Marks the session `DEPLOYING`, persists the confirmed protocols, syncs generated configs to the legacy schema for compatibility.
2. Calls [saveBuilderConfig](../control/lib/builder/executor.js#L32), which composes per-protocol instruction cartridges, runs `buildDeploymentConfig`, and writes a row to the deployments table tagged with `_modular: { paradigm, enabledProtocols, sessionId }`.
3. Immediately calls [buildArtifact](../control/lib/deployers/build.js) to produce the ZIP — unlike the wizard, which surfaces "Build & Download" as a second user click, the chat builder builds in the same call. If the build fails, the row stays saved and the chat reports the error; the user can retry from the dashboard.

A back-compat alias `deploy_modular_bot` maps to this same handler ([tool-executors.js:1302](../control/lib/builder/tool-executors.js#L1302)) so chat sessions persisted before the rename still replay correctly.

---

## The tool loop

The loop in [route.js:568](../control/app/api/builder/stream/route.js#L568) is a fairly literal implementation of the Claude tool-use protocol:

```
for iteration in 1..10:
  POST /v1/messages with current messages, system prompt, tools (cached)
  Stream the response:
    - text_delta  → forward to client as TEXT events
    - tool_use    → accumulate into toolUseBlocks
  After stream ends:
    if no tool_use blocks → done, return
    for each tool_use:
      emit tool_started event
      result = executeBuilderTool(name, input, context)
      emit tool_completed (or tool_failed) event
      if name in {infer_intent, recommend_protocols, compose_identity, ...}:
        also emit a typed milestone event
    append assistant message (text + tool_use blocks)
    append user message (tool_result blocks)
    sleep 500ms
```

A few non-obvious details:

- **The session is reloaded inside the loop.** Tool handlers mutate the session row in SQLite; the loop fetches a fresh session before each tool call ([route.js:678](../control/app/api/builder/stream/route.js#L678)) so the next handler sees the previous handler's writes.
- **Prompt caching is on the system prompt and the last tool.** The system prompt has `cache_control: ephemeral`, and the *last* tool in the array is also marked cacheable ([route.js:561-566](../control/app/api/builder/stream/route.js#L561-L566)) — the Anthropic API caches the prefix up to the last cache breakpoint, so the entire tools list ends up in the cache. Iterations after the first only pay for the new messages.
- **Parallel tool calls work because the Claude protocol supports it.** When Claude returns multiple `tool_use` blocks in one turn (e.g., `set_suggested_prompts` + `generate_bot_summary`), the loop runs them sequentially in the route but feeds all the results back as a single user-message turn. Claude sees the parallel call complete atomically.
- **Tool errors don't halt the loop.** A failed tool returns `is_error: true` in the tool_result; Claude reads that and decides whether to retry, route around, or report to the user. The loop only exits on an iteration where Claude emits no tool_use blocks (terminal text reply) or the iteration cap is hit.

---

## Streaming events

The route emits ~20 custom event types on top of Claude's SSE — defined in [EventTypes](../control/app/api/builder/stream/route.js#L40). The UI consumes these to drive specific affordances:

| Event                       | Triggered when                             | UI uses it for                          |
|-----------------------------|--------------------------------------------|-----------------------------------------|
| `text`                      | Claude emits a text_delta                  | Streaming the bot's prose into the chat |
| `modulo_expression`         | State transition (speaking, thinking, ...) | Animating the Modulo avatar             |
| `tool_started`              | Before a tool handler runs                 | "Processing documents..." status pill   |
| `tool_completed`            | After a successful tool run                | Checkmark + result preview              |
| `tool_failed`               | After a tool errors                        | Red status + error message              |
| `inference_complete`        | After `infer_intent`                       | Lights up the intent classification card|
| `protocols_recommended`     | After `recommend_protocols`                | Renders the protocol toggle card        |
| `identity_composed`         | After `compose_identity`                   | Renders the bot name + greeting preview |
| `prompts_set`               | After `set_suggested_prompts`              | Renders the suggested-prompt chips      |
| `bot_summary_generated`     | After `generate_bot_summary`               | (Silent — internal-only)                |
| `awaiting_confirmation`     | When the loop ends without `save_modular_bot` | Renders [Adjust] / [Save & Build] CTAs |
| `deployment_started/progress/complete/failed` | During `save_modular_bot` | Build progress indicator + final result |
| `done`                      | Stream end                                 | Closes the SSE connection               |

The split lets the UI render structured cards without parsing model text. When the model says "I'll enable Knowledge and Forms based on your docs", the chat shows that prose *and* the protocol-toggle card lights up in parallel — driven by two independent events.

The avatar animation uses both channels: `[expression:thinking]` markers in the text stream ([system-prompt.js:60](../control/lib/builder/system-prompt.js#L60)) get parsed out and converted to `modulo_expression` events on the client side, while server-driven transitions (tool start = thinking, tool success = success, tool fail = concerned) come over the dedicated event channel.

---

## Convergence with the wizard

The chat builder and the wizard build the *same artifact*. The convergence is structural:

- **Same config row.** Both write to the deployments table via [DeploymentRepository](../control/lib/db/repositories/deployments.js), both tag with `_modular: { paradigm: 'modular', enabledProtocols, sessionId? }`. The chat builder's [buildDeploymentConfig](../control/lib/builder/executor.js#L171) is a sibling of the wizard's [buildDeploymentConfig](../control/lib/config-builder.js#L159) — different functions, same output shape, both leaning on the shared `buildLLMConfig` helper.
- **Same downstream pipeline.** Both saved configs are picked up by the same [DockerDeployer](../control/lib/deployers/docker.js) when `buildArtifact` runs. The deployer doesn't read the paradigm marker — it just composes per-bot files (`config.json`, `instructions.txt`, `embeddings.json`, `formFormat.json`, `triageRoutes.json` as needed) and zips them.
- **Round-trippable.** A chat-builder bot can be opened in the wizard for editing — [parseModularDeploymentConfig](../control/lib/config-builder.js#L333) reads the saved config and reconstructs wizard state regardless of which builder produced it. The reverse holds too: a wizard bot can be re-edited from the chat builder via [buildBuilderEditPrompt](../control/lib/builder/system-prompt.js#L293), which seeds Claude's context with the existing config.

The one notable runtime difference: the chat builder calls `buildArtifact` inline inside `save_modular_bot`, while the wizard splits save and build into two API calls. That's the only place the two paths diverge meaningfully — and both paths can leave a deployment row in `status=saved` if the build fails, both surface a Build & Download CTA on the dashboard for that row.

---

## File map

| File | Role |
|------|------|
| [control/app/chat-builder/page.jsx](../control/app/chat-builder/page.jsx) | Route entry; mounts `InvertedModularChatPanel` |
| [control/components/ModularChat/InvertedModularChatPanel.jsx](../control/components/ModularChat/) | The chat UI: input box, message list, status pills, confirmation cards |
| [control/app/api/builder/stream/route.js](../control/app/api/builder/stream/route.js) | The SSE endpoint: evaluator call, system prompt, tool loop, event stream |
| [control/lib/builder/tools.js](../control/lib/builder/tools.js) | The 10 tool definitions (JSON schemas) Claude sees |
| [control/lib/builder/tool-executors.js](../control/lib/builder/tool-executors.js) | The handlers — one per tool, dispatched by `executeBuilderTool` |
| [control/lib/builder/system-prompt.js](../control/lib/builder/system-prompt.js) | `buildBuilderSystemPrompt` + the high/low assistance branch + edit-mode prompt |
| [control/lib/builder/evaluator.js](../control/lib/builder/evaluator.js) | The two-tier intent classifier (heuristic + LLM) |
| [control/lib/builder/executor.js](../control/lib/builder/executor.js) | `saveBuilderConfig` — the chat builder's config-row writer |
| [control/lib/builder/session.js](../control/lib/builder/session.js) | Session state, protocol toggling, instructions composition |
| [control/lib/builder/index.js](../control/lib/builder/index.js) | Module entry point — re-exports the public surface |

---

## See also

- [docs/wizard-builder.md](wizard-builder.md) — the structured alternative; same artifact, different driver
- [docs/vector-rag.md](vector-rag.md) — what `process_documents` actually produces
- [docs/form-collection.md](form-collection.md) — what `generate_form_schema` feeds into
- [docs/federated-routing.md](federated-routing.md) — what `generate_triage_config` becomes at runtime, including chain-hash handoffs
- [docs/bot-frontend.md](bot-frontend.md) — the bot client that consumes everything composed here
