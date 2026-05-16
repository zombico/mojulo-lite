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

   # Optional: surface conversation / submission / verify tools.
   # Off by default. Set to 1 to register the read tools.
   MCP_EXPOSE_CONVERSATIONS=1
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

### Operate (gated)

Registered only when `MCP_EXPOSE_CONVERSATIONS=1`:

| Tool                  | Reads from                | Notes                                          |
| --------------------- | -------------------------- | ---------------------------------------------- |
| `list_deployments`    | control plane SQLite       | Always on. Filter by status / mode.            |
| `get_deployment`      | control plane SQLite       | Always on.                                     |
| `query_conversations` | bot SQLite via bot-proxy   | Conversation data stays on the bot.             |
| `get_conversation`    | bot SQLite via bot-proxy   |                                                |
| `query_submissions`   | bot SQLite via bot-proxy   |                                                |
| `verify_chain`        | bot                        | Walks the tamper-evident hash chain.            |

`list_deployments` and `get_deployment` are always registered (they're just metadata reads); the transcript-touching tools require the env flag.

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
