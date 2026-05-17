# MCP integration

Expose the control plane as a remote MCP server so the user's own Claude (Claude Desktop, Claude Code, or any other MCP HTTP client) can build, operate, and audit mojulo bots through tool calls.

The MCP route is **opt-in**. With `CONTROL_PLANE_MCP_KEY` unset (the default), `/api/mcp` returns 404 and the surface is invisible. Set the key and the route comes online with bearer auth.

See [lite-template/integration/claude_mcp_plan.md](../lite-template/integration/claude_mcp_plan.md) for the design rationale.

---

## What you get

When `/api/mcp` is enabled, the user's Claude becomes the agent loop and the control plane becomes a tool host. The same `builderToolHandlers` that power the in-app chat builder are exposed as MCP tools, plus a few read tools for inspecting deployed bots.

- Build a bot from a fresh Claude Desktop conversation: *"build me a triage bot for my dental practice"*.
- Reasoning bill moves to the user's Claude subscription. The control plane does not need an Anthropic key for builder-time work.
- Mix mojulo tools with other MCP servers in one agent loop (Linear, GitHub, Notion, etc.).
- Read deployed bot state (deployments, conversations, submissions, chain verification) — without copying transcript data into the control-plane DB.

---

## Enabling the server

1. Pick a long random string for the bearer token. Anything ≥32 chars from `openssl rand -hex 32` is fine.
2. Add to your control plane env (`control/.env`):

   ```bash
   CONTROL_PLANE_MCP_KEY=<your-random-token>
   ```

3. Restart the control plane (`cd control && npm run dev`).

The route is now live at `POST /api/mcp`. The middleware ([control/middleware.js](../control/middleware.js)) skips session-cookie checks for `/api/mcp`; bearer auth is enforced inside the route.

---

## Connecting from Claude

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "mojulo": {
      "url": "http://localhost:3001/api/mcp",
      "headers": {
        "Authorization": "Bearer <CONTROL_PLANE_MCP_KEY>"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear in the picker.

### Claude Code

```bash
claude mcp add --transport http mojulo http://localhost:3001/api/mcp \
  --header "Authorization: Bearer <CONTROL_PLANE_MCP_KEY>"
```

### mcp-inspector (debugging)

```bash
npx @modelcontextprotocol/inspector http://localhost:3001/api/mcp \
  --header "Authorization: Bearer <CONTROL_PLANE_MCP_KEY>"
```

---

## Tool surface

### Build (always on)

| Tool                            | Synchronous / job | Notes                                                                                  |
| ------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `infer_intent`                  | sync              | Heuristic — fast.                                                                       |
| `recommend_protocols`           | sync              |                                                                                        |
| `generate_form_schema`          | sync              | LLM-backed; usually ≤2s.                                                                |
| `generate_appointment_config`   | sync              |                                                                                        |
| `generate_triage_config`        | sync              | Embeds route descriptions into the bot's vector store locally.                          |
| `generate_optical_read_config`  | sync              |                                                                                        |
| `compose_identity`              | sync              | LLM-backed when domain digest is present.                                              |
| `set_suggested_prompts`         | sync              |                                                                                        |
| `generate_bot_summary`          | sync              | LLM-backed.                                                                            |
| `process_documents`             | **job**           | Parses + embeds documents. Returns `{ jobId }`; poll with `poll_job`.                   |
| `save_modular_bot`              | **job**           | Persists the deployment row and builds the artifact. Returns `{ jobId }`.               |
| `upload_document_from_url`      | sync              | MCP-native document ingestion. Accepts `url`, `base64 + fileName`, or `text + fileName` (use `text` when piping already-extracted content from another MCP server like Google Docs — skips the binary round-trip through the model). Returns a `documentId`. |
| `poll_job`                      | sync              | Poll a job started by the job-based tools above.                                        |
| `start_new_bot`                 | sync              | Reset the builder session — call when the user wants to build a second bot.             |
| `get_builder_session`           | sync              | Inspect the current in-progress configuration.                                          |

### Operate

| Tool                  | Reads from                | Notes                                          |
| --------------------- | -------------------------- | ---------------------------------------------- |
| `list_deployments`    | control plane SQLite       | Filter by status / mode.                       |
| `get_deployment`      | control plane SQLite       |                                                |
| `query_conversations` | bot SQLite via bot-proxy   | Summaries only (id, timestamps, turn count). Optional since / until bounds.    |
| `get_conversation`    | bot SQLite via bot-proxy   | Full turn list for one conversation.            |
| `export_conversations`| bot SQLite via bot-proxy   | Full turn dump with optional date bounds. Heavy — bound by date on large bots. |
| `query_submissions`   | bot SQLite via bot-proxy   |                                                |
| `verify_chain`        | bot                        | Walks the tamper-evident hash chain.            |

Conversation- and submission-reading tools proxy through to the bot — they never copy transcript rows into the control-plane DB.

### Catalysts

| Tool              | Returns                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `list_catalysts`  | The curated library: `id`, `name`, `summary`, `category`, `requires` per catalyst. Optional `category` filter. |
| `get_catalyst`    | Full catalyst body for one `id` — the prose recipe Claude reads at synthesis time.                 |

Catalysts are curated workflow patterns (qualify-lead-to-crm, submission-to-ticket, appointment-to-calendar, weekly-submissions-digest, scan-conversations-for-signal, knowledge-gap-miner). The user's Claude pulls a catalyst, reads the target bot's shape via `get_deployment`, picks a destination MCP from what's installed locally, and synthesizes a concrete skill into `.claude/skills/`. The "catalyst" name is literal — each file enables one phase transition from intent + bot shape + destination MCP into a structured skill, without itself appearing in the result. The bare name (not "skill catalyst") is deliberate: catalysts **produce** skills, they are not themselves skills. See [docs/catalysts.md](catalysts.md) for the author spec.

The catalyst library is repo-only — there is no user-writable catalyst directory. Custom patterns are Claude Code's responsibility (synthesize from scratch, or maintain catalyst-shaped markdown locally). New patterns worth promoting to the canonical library are added by PR to [control/lib/mcp/catalysts/](../control/lib/mcp/catalysts/).

---

## Recipes — composing mojulo tools with your other MCP servers

The point of MCP exposure isn't a second way to drive the in-app chat-builder. It's that mojulo's tools sit in the same agent loop as your other MCP servers (Drive, Gmail, Linear, GitHub, Notion). None of the recipes below are reachable from the in-app chat-builder, because it can't see your other tools.

### 1. Drive folder → bot knowledge base

**You need:** the Google Drive MCP server connected alongside mojulo.

**Prompt:** *"Use every doc in my Drive folder 'Practice SOPs' as the knowledge base for a triage bot for my dental clinic."*

**Flow:** Drive lists + reads each doc → pipe the extracted text into `upload_document_from_url` with `text + fileName` (this mode is what skips the binary round-trip through the model when another MCP server already has parsed content) → `process_documents` returns a `jobId` → `poll_job` until done → `recommend_protocols` / `generate_triage_config` / `save_modular_bot`.

### 2. Linear escalations → triage routes

**You need:** the Linear MCP server connected.

**Prompt:** *"Pull the top 10 escalation labels from Linear project SUPPORT for the last quarter and turn them into triage routes for a customer-service bot."*

**Flow:** Linear queries issues by label/priority → Claude aggregates them into route descriptions → `generate_triage_config` embeds each route description into the bot's vector store → `save_modular_bot`.

### 3. Qualify submission → branch CRM workflow

**You need:** a downstream MCP server for the action — CRM (Salesforce / HubSpot), email (Gmail), ticketing (Linear), or a generic webhook MCP for anything else.

**Example.** A dental clinic intake bot captures: name, DOB, insurance carrier, chief complaint, returning-patient Y/N. The skill pulls new submissions, classifies each on those fields plus the free-text, and branches:

- New patient + accepted insurance → CRM `create_contact` + add to onboarding sequence + draft welcome email
- Returning patient → CRM `update_contact_last_visit` + scheduling email
- Chief complaint flagged urgent → Linear ticket for the on-call coordinator

**Prompt:** *"For new submissions since `2026-05-15` on deployment `<id>`, run the new-patient routing workflow."*

**Flow:** `query_submissions` with a `since` cursor → Claude classifies on the form fields → routes each submission to the right downstream MCP tool. Conversation rows never leave the bot — `query_submissions` proxies through [bot-proxy.js](../control/lib/deployers/bot-proxy.js).

**Package it as a skill** (`.claude/skills/route-intake.md`) once the classification rules stabilize. Take `deploymentId` and `since` as args; the cursor is what makes the skill idempotent across invocations — re-running it won't double-register a patient because already-seen submissions are below the cursor.

**Two things to be deliberate about:**

- **PII back through the LLM.** The form-gathering protocol's design point is that PII bypasses the LLM at *capture* time. This recipe deliberately reintroduces it at *routing* time, since classifying on insurance carrier or chief complaint requires reading those fields. Fine for many setups; worth thinking through against the data-handling posture you advertised to end users.
- **Irreversible writes.** For CRM creates, welcome-email sends, anything you can't easily undo — design the skill to propose the routing decision and confirm before firing, rather than fire-and-forget. The MCP tool surface doesn't enforce this; the skill's prompt does.

**Not event-driven.** Skills are invoked, not subscribed — there's no MCP path that fires on a new submission. If you need true event delivery, point the bot's form webhook ([server.js](../lite-template/server.js)'s `/api/send-webhook` proxy) at a listener you control; the skill then becomes the "what to do with what arrived" half, invoked by you or the listener-side automation.

### 4. Sampled mention scan → analytical handoff

**You need:** an output target (Linear / Notion / Slack / Google Doc via the matching MCP).

**Example.** A SaaS support bot. Take a recent sample — say, the last 30 conversations — and scan each for competitor mentions, churn-intent language, or recurring feature requests. Anything that fires: file a Linear ticket tagged `voice-of-customer` with the conversation id and the matching snippet.

**Prompt:** *"Sample the 30 most recent conversations from deployment `<id>` and flag any churn-intent signals as Linear tickets."*

**Flow:** `query_conversations` with a small limit → `get_conversation` per id → Claude scans the turn text → matches go to the downstream MCP.

**Sampling is the point.** This recipe is a pattern proof, not a fleet sweep. A bounded sample keeps token cost predictable and lets you tune the signal prompt against real conversations before scaling up. Once the signal looks reliable, the same skill takes a larger window — or runs on a cadence via `/schedule` for ongoing tuning, without keeping an interactive session open.

**Package it as a skill** (`.claude/skills/scan-conversations.md`) taking `deploymentId`, `sampleSize`, and the signal definition. Different signals (competitor mentions, churn intent, accessibility complaints) become different invocations of the same skill rather than separate skills.

---

Recipes 1 and 2 use another MCP server as the *data source* and mojulo as the artifact producer. Recipes 3 and 4 invert that: mojulo's read tools are the data source, and the downstream MCP servers are the actuators. In both directions, the user's Claude is the glue — and 3 and 4 in particular are the ones worth promoting from ad-hoc prompts to versioned skills, since the orchestration is reusable, the inputs are parameterizable, and the output feeds further automation.

---

## Catalysts — synthesizing a skill from a curated pattern

Recipes 3 and 4 above are the **prototype**. Catalysts are the **productized** version. A catalyst is a reusable pattern shipped with mojulo (`qualify-lead-to-crm`, `submission-to-ticket`, `appointment-to-calendar`, `weekly-submissions-digest`, `scan-conversations-for-signal`, `knowledge-gap-miner`) that Claude reads and uses to synthesize a concrete skill specific to one of your bots. The name is literal — each catalyst enables one phase transition from your intent + the bot's shape + a destination MCP into a structured skill, without itself appearing in the result. (The bare term is deliberate; catalysts produce skills, they are not skills.)

The synthesis sequence:

1. **Discover.** *"What catalysts are available?"* — Claude calls `list_catalysts`. You can ask for a specific one (*"use the qualify-lead-to-crm catalyst for my dental intake bot"*) or have Claude pick by description.
2. **Read the catalyst.** Claude calls `get_catalyst(id)` to pull the full body — the workflow logic, mapping intent, pitfalls, and skill contract. The body opens with a synthesizer briefing that licenses Claude to adapt, combine catalysts, or write from scratch if the catalog doesn't fit.
3. **Read the bot shape.** Claude calls `get_deployment(deploymentId)` to read your bot's form schema, enabled protocols, triage routes, and identity. The catalyst's mapping is derived from this — never guessed.
4. **Bind a destination MCP.** Claude scans the MCPs you have installed in Claude Code (HubSpot, Linear, Notion, Slack, whatever), finds the candidates that match the catalyst's destination category, and asks you to confirm: *"You have `hubspot-mcp` and `pipedrive-mcp` — which one is this for?"* The chosen MCP gets hard-coded into the synthesized skill.
5. **Answer parameter prompts.** Claude asks the questions the catalyst declares (qualifying rubric, score threshold, dedupe key, etc.) in one round.
6. **Write the skill.** Claude writes `.claude/skills/<bot-slug>-<purpose>/SKILL.md` referencing the mojulo MCP and your bound destination MCP. The skill defaults to `--dry-run` for any catalyst that writes externally; you opt into live writes explicitly.

From this point you own the skill. Edit, version-control, share. The catalyst is not a live link — if the canonical catalyst later improves, your existing skill doesn't auto-update. Re-run the flow if you want to regenerate.

**Credentials never touch mojulo.** Destination-system auth lives entirely in Claude Code (the destination MCP's own config). Mojulo only knows that *some* CRM-shaped MCP exists; it never sees your HubSpot key.

**No user-writable catalyst library.** Custom or one-off workflows that don't merit a canonical catalyst are Claude Code's responsibility — either let Claude synthesize without a catalyst, or maintain catalyst-shaped markdown locally and feed it inline. New patterns worth promoting to the canonical library are added by PR to [control/lib/mcp/catalysts/](../control/lib/mcp/catalysts/); see [docs/catalysts.md](catalysts.md) for the author spec.

---

## Session model

A single MCP connection lazily binds one `modular_sessions` row on its first build-ring tool call. Subsequent build calls reuse it. To build a second bot in the same connection, call `start_new_bot` — the next build tool will create a fresh session.

On control-plane restart, the in-memory binding map is lost. The bot row stays in SQLite; the user's Claude effectively starts a new session.

Jobs are reaped on startup: anything left in `pending` / `running` is marked `error` so polls on stale jobIds return a clear failure.

---

## Security posture

- One token, one user. The bearer token is god-mode for the control plane's build / read tools.
- Don't expose `/api/mcp` to the public internet. Same advice as `CONTROL_PLANE_USER` / `CONTROL_PLANE_PASSWORD`. Run locally, on a tailnet, or behind a reverse proxy you control.
- Conversation data never lives in the control-plane DB. Read tools that surface conversations proxy through `bot-proxy.js` to the bot's own SQLite.
- The bot runtime ([lite-template/](../lite-template/)) is untouched by MCP — there's no MCP path into runtime turn data that bypasses the existing proxy boundary.

---

## Troubleshooting

- **`/api/mcp` returns 404.** `CONTROL_PLANE_MCP_KEY` is unset. Set it and restart.
- **`/api/mcp` returns 401.** The bearer token doesn't match. Check for trailing whitespace / a leading `Bearer ` doubled in the header.
- **`No LLM provider key configured` from a build tool.** The control plane needs at least one provider key on `/settings` — the bot under construction inherits the default provider/model for in-loop LLM calls (form generation, identity composition, summary). The user's Claude is the *agent loop*, but the *builder pipeline* still calls an LLM for these structured generations.
- **`Bot is not connected` from a read tool.** The deployment row has no URL. Connect the bot via the dashboard or `gh` the bot's URL first.
- **A job stays at `pending` forever.** Control plane probably restarted mid-flight. Start the operation again — the stale job is marked errored automatically on next launch.
