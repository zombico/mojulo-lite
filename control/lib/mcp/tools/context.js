/**
 * MCP Ring 0 — orientation.
 *
 * The connecting model's first impression of mojulo is just the initialize
 * preamble in [server.js], which is deliberately short. Everything heavier —
 * the concept glossary, the capability model, the deploy/connect lifecycle,
 * the per-tool one-liners — lives here, behind the `forward_context` tool,
 * so the agent only pays the context cost when the user actually asks about
 * mojulo or seems disoriented about which tools to pick.
 *
 * Editing rules:
 * - Glossary first: every mojulo-specific noun gets defined the first time it
 *   appears. The reviewer feedback that prompted this layout: the agent
 *   shouldn't have to read tool descriptions to disambiguate vocabulary.
 * - Tool index has to stay in sync with the actual tool registrations across
 *   build.js, jobs-tools.js, operate.js, catalysts.js, and this file. If you
 *   add or remove a tool, update the relevant section here too.
 */

import { registerTool } from '@/lib/mcp/server';

// Exported for tests.
export const FORWARD_CONTEXT_BODY = `# Mojulo, oriented

Mojulo is a control plane for **chatbot-based solutions**. You build a chatbot, deploy it where users can reach it, let it collect conversations and form submissions, then turn what it captured into action in the tools the user already runs — typically via the other MCP servers they already have installed (Gmail, Google Drive, Google Calendar, plus whichever CRM / ticketing / warehouse MCPs they use).

---

## Concepts

- **Bot** — a deployed chatbot service. Runs as its own process (local Docker container or Fly.io app). Owns its own SQLite database; **every conversation and submission lives there and never leaves**.
- **Deployment** — the control plane's row for a bot: id, name, status, URL, enabled capabilities, last_seen_at. The deployment ≠ the bot itself — it's the metadata that lets the control plane locate and describe the bot.
- **Protocol** — a capability a bot can have turned on. Five of them ship today:
  - \`knowledge\` — answers questions from documents the user uploads (in-process RAG; no external embedding API calls at runtime).
  - \`formGathering\` — collects structured fields conversationally and writes a submission row.
  - \`appointments\` — books slots against a configured schedule.
  - \`triage\` — routes a conversation to a specialist bot via a federated handoff (the audit chain extends across bots).
  - \`opticalRead\` — extracts data from photos / screenshots (vision-capable models only).
- **Chain** — every bot turn is hash-linked to the previous one, so the transcript is tamper-evident. \`verify_chain\` walks the chain for any conversation.
- **Catalyst** — a workflow recipe shipped with mojulo. You read one with \`get_catalyst\`, then combine it with what a bot has captured + an MCP the user already has installed to write a local Claude Code skill (\`.claude/skills/<name>/SKILL.md\`) that turns the captured signal into action. The catalyst itself is a starting point — adapt freely, or skip it and synthesize from scratch. *See the texture preview below.*

---

## Catalyst texture preview

To set expectations, here is the opening of the canonical \`qualify-lead-to-crm\` catalyst body — every catalyst is shaped like this:

> **How to synthesize the skill**
>
> 1. Call \`get_deployment(deploymentId)\` to read the bot's form schema. The synthesized skill's mapping is derived from this schema — never guess field names.
> 2. Ask the user the three \`parameters\` questions in one round.
> 3. Inspect the bound destination MCP to learn its contact-create surface (field names, required props, search-by-property tool). Field mapping is the catalyst's value-add — don't assume it's \`name\`/\`email\`/\`phone\` everywhere; HubSpot uses \`firstname\`/\`lastname\`, Salesforce uses \`FirstName\`/\`LastName\`, Attio uses object/attribute pairs.
> 4. Write \`.claude/skills/<bot-slug>-crm-sync/SKILL.md\` with the synthesized workflow.

That density runs through the whole body — numbered synthesis steps, mapping rules per field type, pitfalls (PII through the LLM, idempotency, irreversible writes), and calibration tips. Plan to read the entire catalyst before writing the skill; don't skim.

---

## Lifecycle: build → deploy → connect → operate

1. **Build.** Pick which protocols (capabilities) the bot needs, generate their configs, upload any documents the bot should know, compose the bot's identity. Either drive this step-by-step through the build tools, or just describe the user's goal and let the build tools sequence themselves starting from \`infer_intent\`.

   *Builder-session scope.* Build tools share state via a **builder session** keyed on the \`mcp-session-id\` header your client sends. The session row persists in the control plane's SQLite, but the header→session binding is held in process memory. So: the same client reconnecting during a single control-plane process lifetime resumes its in-progress config, while a **control-plane restart drops the binding** and the user's next build tool call starts a fresh bot (the orphaned row stays in SQLite). Inside the same connection, \`start_new_bot\` deliberately discards in-progress config and starts over.
2. **Deploy.** \`save_modular_bot\` compiles the configured bot into a downloadable zip artifact. The user runs it locally (Docker) or in the cloud (Fly.io). The container image is bot-agnostic — per-bot config is injected at start time, so the same image runs every bot the user has.
3. **Connect.** Once the bot starts, it phones home to the control plane with its URL. From then on the control plane can reach it through a bearer-authenticated proxy. **Conversation data stays in the bot's SQLite forever** — the control plane only stores \`url\` and \`last_seen_at\`. Any tool that needs transcript data proxies through to the bot in real time.
4. **Operate.** Use the operate tools to read what bots have captured. Use the catalyst tools to turn that captured signal into action via the user's other installed MCPs.

---

## Tool index (one line each)

### Orientation
- \`forward_context\` — (you are reading its output) glossary, lifecycle, tool index.

### Build, synchronous
- \`infer_intent\` — read a free-text description of what the user wants and produce a structured intent the rest of the build tools can act on.
- \`recommend_protocols\` — given the intent, suggest which protocols to enable (clamped to what the selected model can reliably support).
- \`compose_identity\` — generate the bot's name, persona, and starter prompts.
- \`generate_form_schema\` — produce the form-field schema for \`formGathering\`.
- \`generate_appointment_config\` — produce booking config for \`appointments\`.
- \`generate_triage_config\` — produce routing config for \`triage\`.
- \`generate_optical_read_config\` — produce extraction config for \`opticalRead\`.
- \`set_suggested_prompts\` — overwrite the starter prompts shown in the bot UI.
- \`generate_bot_summary\` — produce the one-line summary stored on the deployment.
- \`get_builder_session\` — read the in-progress bot config for this MCP connection.
- \`start_new_bot\` — discard the in-progress config and start fresh in this MCP connection.

### Build, documents and artifact compilation
- \`upload_document_from_url\` — **sync**, ~1–5s. Upload a PDF / DOCX / TXT / MD / HTML the bot should learn from. Accepts a URL, base64, or pre-extracted text. → returns \`{ documentId, originalName, mimeType, sizeBytes, message }\`. Pass \`documentId\` into \`process_documents\`.
- \`process_documents\` — **async**, returns \`{ jobId }\`. ~10–30s **per document** (parse + chunk + embed + per-doc LLM summary). Many or large docs can run minutes. Makes documents available to the \`knowledge\` protocol.
- \`save_modular_bot\` — **async**, returns \`{ jobId }\`. ~10–60s in prebuilt-image mode (compose cartridges + write config + zip); longer when the control plane is in offline-build mode (\`MOJULO_OFFLINE_BUILD=1\` bundles full bot source). Compiles the configured bot into the downloadable artifact.
- \`poll_job\` — **sync**. Check the status of any async job. → returns \`{ jobId, tool, status: "pending" | "running" | "done" | "error", progress, result, error }\`. Reasonable polling cadence is every 2–5s.

### Operate (read what deployed bots have captured)
- \`list_deployments\` — list bots known to the control plane. → returns \`{ total, limit, offset, deployments: [{ id, botName, status, url, lastSeenAt, configHash, lastBuiltHash, ragMode, embeddingChunkCount, cloud, createdAt, updatedAt }] }\`. No transcript data.
- \`get_deployment\` — full row for one bot. → returns the list-shape fields above, **plus** \`config\` (the bot's identity, suggested prompts, enabled protocols, generated form/appointment/triage/optical-read configs — credentials redacted), \`botSummary\`, \`documentIds\`. **The identity prompt, form schema, and per-protocol configs all live under \`config\`** — this is the tool to call when a catalyst says "read the bot's identity" or "read the form schema."
- \`query_conversations\` — conversation summaries on a connected bot (proxied — conversation data lives in the bot's SQLite, not here). → returns \`{ botName, total, conversations: [{ conversationId, startedAt, lastActivity, turnCount }] }\`. No turn content; call \`get_conversation\` or \`export_conversations\` for that.
- \`get_conversation\` — full turn list for one conversation. → returns \`{ conversationId, turnCount, turns, verification }\`. Turn fields: \`id, conversationId, turn, timestamp, userPrompt, llmResponse, machineState, ragContext, contentHash, chainHash, eventType, handoffHash\`.
- \`export_conversations\` — bulk export full conversations and turns. → returns \`{ botName, conversations: [{ conversationId, startedAt, lastActivity, turnCount, turns }] }\`. Same turn shape as \`get_conversation\`.
- \`query_submissions\` — list form-gathering submissions. → returns \`{ botName, submissions: [{ id, conversationId, formData, metadata, schemaFingerprint, isComplete, submittedAt, webhookStatus, webhookError }], count, total }\`. \`formData\` is an object keyed by form-field id — call \`get_deployment\` to read the field schema you'll be mapping from.
- \`verify_chain\` — walk the tamper-evident hash chain for one conversation. → returns the bot's verification result (valid / invalid + per-turn details). See \`docs/turn-hashing.md\` for chain semantics.

### Catalysts (consult on outcomes; turn captured signal into action)

Mojulo is a **consultation surface**, not a strict executor. When the user asks what to do with a deployed bot, you should be ready to suggest workflows even when they require an integration the user doesn't yet have installed — framed as opt-in upgrades, never as blockers.

- \`recommend_catalysts\` — given a \`deploymentId\`, return catalysts whose shape matches that bot, each annotated with a \`valueHook\` (one-sentence user-outcome), \`destinationCategory\` (kind of MCP needed), \`destinationExamples\` (named MCPs that satisfy it), and \`missingProtocols\` (if the bot's current capabilities don't quite fit). Response includes a \`consultationPosture\` block with framing rules — read it. **This is the entry point for "what can I do with this bot?"** Cross-reference \`destinationExamples\` against MCPs available in this session: examples installed → "you can do this now"; examples not installed → soft suggestion ("if you wanted, installing HubSpot or Salesforce would unlock X").
- \`list_catalysts\` — flat catalog of every shipped recipe, filterable by category. Use when the user wants to browse what mojulo offers in general, or when no specific bot is in scope.
- \`get_catalyst\` — read one recipe's full body (the response also includes a synthesizer briefing) so you can write a local skill into the user's \`.claude/skills/\`.
- \`custom_catalyst\` — author's guide for **contributing a new catalyst back to the mojulo library**. Use when the user wants to propose / write / contribute a catalyst (not when they want to automate something just for themselves — that's a local skill, synthesized from \`get_catalyst\` or from intent directly).

---

## Quick orientation rules

- User wants to **build a new bot**: start with \`infer_intent\`, or jump straight to the specific \`generate_*\` tool if the user already knows what they need.
- User wants to **see what bots exist**: \`list_deployments\`.
- User wants to **do something with what a bot has collected** OR is asking "what can this bot unlock for me?": \`recommend_catalysts\` with the bot's deployment id. Surface suggestions in consultation form — including catalysts whose destination MCP isn't installed yet, framed as opt-in upgrades. Then \`get_catalyst\` to read the recipe before writing a skill.
- User wants to **browse the catalyst library** without a specific bot in mind: \`list_catalysts\`.
- User wants to **contribute a new catalyst** (write / propose / add one to mojulo's shipped library): \`custom_catalyst\`. This returns an author's guide. If the user only wants to automate something for themselves and isn't trying to contribute, do *not* call \`custom_catalyst\` — synthesize a local skill from \`get_catalyst\` or from intent instead.
- User wants to **audit** a conversation's integrity: \`verify_chain\`.
- Conversation and submission data are never copied into the control plane. If you need transcript content, fetch it through the operate tools — don't try to cache it server-side.
`;

export async function forwardContextHandler(_input, _ctx) {
  // Plain text content (not JSON-stringified) so the agent reads it as prose.
  return { content: [{ type: 'text', text: FORWARD_CONTEXT_BODY }] };
}

export function registerContextTools() {
  registerTool({
    name: 'forward_context',
    description:
      "Forward the agent the full mojulo orientation: concept glossary (bot, deployment, protocol, chain, catalyst), the build → deploy → connect → operate lifecycle, and a one-line description of every tool in this MCP. Call this FIRST whenever the user asks what mojulo is, how it works, or which tool to pick — or whenever you (the agent) feel uncertain about mojulo's vocabulary or which entry point fits the user's intent. Read-only, no inputs, idempotent.",
    inputSchema: { type: 'object', properties: {} },
    handler: forwardContextHandler,
  });
}
