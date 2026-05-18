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
5. **Operate the fleet.** Once multiple bots are connected, fleet-level questions ("how is the whole fleet doing?", "which bots saw the most activity?", "find any conversation across every bot that mentioned X") have their own surface — the \`fleet_*\` tools. They fan out across every connected bot and aggregate in process memory; conversation content still stays on each bot. The natural two-step pattern is **fleet-locate** with \`fleet_query_conversations\` → **per-bot-read** with \`get_conversation\`. Same posture as single-bot operate, just batched. Cross-bot catalysts (the new category fleet aggregation enables) come from \`recommend_catalysts\` with \`scope: 'fleet'\`.

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

### Operate (fleet)

Aggregates and metadata only. For conversation content, use \`get_conversation\` against a specific bot — \`fleet_query_conversations\` exists to *locate which bot* a conversation lives on; it does not return turn content. All fleet tools return a consistent \`unreachable: [{ botId, botName, reason }]\` field so you can tell at a glance whether the answer reflects the whole fleet.

- \`fleet_analytics_summary\` — fleet-wide totals + daily breakdown + top bots + protocol mix + per-bot breakdown. → returns \`{ totals, daily, heatmap, topBots, protocolMix, perBot, unreachable, cache }\`. Hits a 60s in-process cache; check \`cache.fromCache\` before answering "is this current?". Warm ~1–3s, cold up to ~30s.
- \`fleet_query_conversations\` — locate conversations across every connected bot. → returns \`{ conversations: [{ botId, botName, conversationId, startedAt, lastActivity, turnCount }], pagination, fleet, unreachable }\`. **Pair with \`get_conversation(id, conversationId)\` for content** — that's the second step of the fleet-locate → per-bot-read pattern.
- \`verify_fleet_chains\` — walk the tamper-evident hash chain across every reachable bot. → returns \`{ valid, totalTurns, invalidTurns, conversationsVerified, failed, perBot, fleet, unreachable }\`. \`valid: true\` requires zero invalid turns **AND** zero unreachable bots — a dark bot can't be audited. This is the one fleet operation that's uniquely agent-shaped; humans won't manually audit chains.

### Operate (read what deployed bots have captured)
- \`list_deployments\` — list bots known to the control plane. → returns \`{ total, limit, offset, deployments: [{ id, botName, status, url, lastSeenAt, configHash, lastBuiltHash, ragMode, embeddingChunkCount, cloud, createdAt, updatedAt }] }\`. No transcript data.
- \`get_deployment\` — full row for one bot. → returns the list-shape fields above, **plus** \`config\` (the bot's identity, suggested prompts, enabled protocols, generated form/appointment/triage/optical-read configs — credentials redacted), \`botSummary\`, \`documentIds\`. **The identity prompt, form schema, and per-protocol configs all live under \`config\`** — this is the tool to call when a catalyst says "read the bot's identity" or "read the form schema."
- \`query_conversations\` — conversation summaries on a connected bot (proxied — conversation data lives in the bot's SQLite, not here). → returns \`{ botName, total, conversations: [{ conversationId, startedAt, lastActivity, turnCount }] }\`. No turn content; call \`get_conversation\` or \`export_conversations\` for that.
- \`get_conversation\` — full turn list for one conversation. → returns \`{ conversationId, turnCount, turns, verification }\`. Turn fields: \`id, conversationId, turn, timestamp, userPrompt, llmResponse, machineState, ragContext, contentHash, chainHash, eventType, handoffHash\`.
- \`export_conversations\` — bulk export full conversations and turns. → returns \`{ botName, conversations: [{ conversationId, startedAt, lastActivity, turnCount, turns }] }\`. Same turn shape as \`get_conversation\`.
- \`query_submissions\` — list form-gathering submissions. → returns \`{ botName, submissions: [{ id, conversationId, formData, metadata, schemaFingerprint, isComplete, submittedAt, webhookStatus, webhookError }], count, total }\`. \`formData\` is an object keyed by form-field id — call \`get_deployment\` to read the field schema you'll be mapping from.
- \`verify_chain\` — walk the tamper-evident hash chain for one conversation. → returns the bot's verification result (valid / invalid + per-turn details). See \`docs/turn-hashing.md\` for chain semantics.

### Designing a new protocol

- \`custom_protocol\` — author's guide for designing a new mojulo protocol (a new bot capability that fires inside a conversation). Returns posture-check rules, the mental model (stackable cartridges + composed response template), the intent-loop-first validation discipline, and the touch-point map. Call this when the user says they want to **extend what their bot does during a turn** — recognize a new intent class, collect a new shape of structured data, render a new UI affordance via the envelope, read a new modality. Do NOT call this for after-the-conversation work (CRM sync, digests, audits) — that's catalyst-shaped; route to \`recommend_catalysts\` / \`custom_catalyst\` instead. The guide explicitly disambiguates protocol vs. catalyst vs. skill; the most common misfire is calling it when the user actually wants a catalyst.

### Catalysts (consult on outcomes; turn captured signal into action)

Mojulo is a **consultation surface**, not a strict executor. When the user asks what to do with a deployed bot, you should be ready to suggest workflows even when they require an integration the user doesn't yet have installed — framed as opt-in upgrades, never as blockers.

- \`recommend_catalysts\` — given a \`deploymentId\` (single-bot mode) OR \`scope: 'fleet'\` / \`deploymentIds: [...]\` (fleet mode), return catalysts whose shape matches the bot(s), each annotated with a \`valueHook\` (one-sentence user-outcome), \`destinationCategory\` (kind of MCP needed), and \`destinationExamples\` (named MCPs that satisfy it). Single-bot mode adds \`missingProtocols\`; fleet mode adds \`applicableDeployments: [{ id, botName }]\` plus \`crossBot: true\` when a catalyst spans ≥2 bots — those are the cross-bot patterns fleet aggregation unlocks (e.g., "weekly digest of qualified leads across every intake bot into one CRM"). Response includes a \`consultationPosture\` block with framing rules — read it. **This is the entry point for "what can I do with this bot?" or "what can I do across all my bots?"** Cross-reference \`destinationExamples\` against MCPs available in this session: examples installed → "you can do this now"; examples not installed → soft suggestion.
- \`list_catalysts\` — flat catalog of every shipped recipe, filterable by category. Use when the user wants to browse what mojulo offers in general, or when no specific bot is in scope.
- \`get_catalyst\` — read one recipe's full body (the response also includes a synthesizer briefing) so you can write a local skill into the user's \`.claude/skills/\`.
- \`custom_catalyst\` — author's guide for **contributing a new catalyst back to the mojulo library**. Use when the user wants to propose / write / contribute a catalyst (not when they want to automate something just for themselves — that's a local skill, synthesized from \`get_catalyst\` or from intent directly).

---

## Quick orientation rules

- User wants to **build a new bot**: start with \`infer_intent\`, or jump straight to the specific \`generate_*\` tool if the user already knows what they need.
- User wants to **see what bots exist**: \`list_deployments\`.
- User wants to **understand state across multiple bots** ("how is the fleet doing?", "which bots are busiest this week?"): \`fleet_analytics_summary\`. For finding specific conversations across the fleet: \`fleet_query_conversations\` to locate, then \`get_conversation\` against the named bot to read content. For auditing chain integrity across every bot at once: \`verify_fleet_chains\`. The fleet tools never expose conversation content — they're the "where to look" surface; per-bot \`get_conversation\` is the "read it" surface.
- User wants to **do something with what a bot has collected** OR is asking "what can this bot unlock for me?": \`recommend_catalysts\` with the bot's deployment id. Surface suggestions in consultation form — including catalysts whose destination MCP isn't installed yet, framed as opt-in upgrades. Then \`get_catalyst\` to read the recipe before writing a skill.
- User wants to **automate something that spans multiple bots** ("digest leads from every bot", "audit all my appointment bookings together"): \`recommend_catalysts\` with \`scope: 'fleet'\`. Fleet-applicable catalysts come back with \`applicableDeployments\` so the synthesized skill knows which bots to iterate over; \`crossBot: true\` flags the patterns that only make sense across multiple bots.
- User wants to **browse the catalyst library** without a specific bot in mind: \`list_catalysts\`.
- User wants to **contribute a new catalyst** (write / propose / add one to mojulo's shipped library): \`custom_catalyst\`. This returns an author's guide. If the user only wants to automate something for themselves and isn't trying to contribute, do *not* call \`custom_catalyst\` — synthesize a local skill from \`get_catalyst\` or from intent instead.
- User wants to **extend what the bot does inside a conversation** ("I want my bot to recognize a new intent and track new state", "can my bot read X from the user?", "I want to add a new capability to mojulo"): \`custom_protocol\`. Returns the protocol design guide. Critical disambiguation up front: if the work happens *after* the conversation (sync to CRM, weekly digest, ticket on signal), that's a catalyst, not a protocol — route to \`recommend_catalysts\` instead. Protocols fire during the agent loop, on every reply, in the LLM's envelope. The guide walks the posture-check first.
- User wants to **audit** a conversation's integrity: \`verify_chain\`.
- Conversation and submission data are never copied into the control plane. If you need transcript content, fetch it through the operate tools — don't try to cache it server-side.
`;

export async function forwardContextHandler(_input, _ctx) {
  // Plain text content (not JSON-stringified) so the agent reads it as prose.
  return { content: [{ type: 'text', text: FORWARD_CONTEXT_BODY }] };
}

// Returned by `custom_protocol`. Synthesized from docs/protocol-composition.md
// for the MCP audience — a Claude Code session connected to mojulo whose user
// wants to think through a new bot capability that fires inside a turn. The
// audience doesn't have the mojulo repo, the composer, or the existing
// cartridges on disk; this body has to carry the mental model self-contained.
//
// Exported for tests.
export const CUSTOM_PROTOCOL_GUIDE = `# Designing a mojulo protocol — author's guide

You are about to help the user think through a new mojulo **protocol** — a bot capability that fires inside a conversation, on every reply, in the LLM's envelope. Five ship today (\`knowledge\`, \`formGathering\`, \`appointments\`, \`triage\`, \`opticalRead\`). A new one is a code change to mojulo, not a config tweak, and it ripples through the cartridge composer, the response envelope, the wizard, and the chat builder.

If you're unclear on protocol vs. catalyst vs. skill, call \`forward_context\` first — those three terms overlap, and protocol design goes sideways fast if they're not kept distinct.

---

## Step 0 — Posture check (push back here, before designing anything)

Protocols are a heavier commitment than catalysts. Many requests that *sound* protocol-shaped are actually catalysts; a few are identity-prompt tweaks. Walk these before drafting.

**A protocol is the wrong tool if any apply:**

1. **The work happens after the conversation.** Pushing form submissions to a CRM, summarizing a week of chats, scanning logs for signal — these run on already-captured data; the bot has nothing to do with them during a turn. → **catalyst.**
2. **The work is operator- or scheduler-initiated.** "Once a week, email me a digest", "when someone fills the form, file a ticket" — the end user shouldn't have to trigger it by talking to the bot. → **catalyst.**
3. **The work touches external systems with credentials.** CRM, ticketing, calendar, Slack, docs. Mojulo deliberately keeps integration credentials in Claude Code (where the user's MCP servers live), not in the bot's runtime — adding them to a protocol would invert that architecture for one capability. → **catalyst.**
4. **The capability is bespoke to one client, vertical, or workflow.** Upstream protocols have to clear a broader-applicability bar (the existing five did). One-off needs belong in a fork or as catalyst-synthesized skills. → **fork or skill.**
5. **The work is purely about how the bot phrases something.** "Be more empathetic", "ask a follow-up before answering" — that's the identity prompt or the objective string, not a new protocol. → **\`compose_identity\` or bot objective.**

If any apply, name it explicitly to the user and route them — don't try to fit the request into a protocol shape.

**Example pushback:**

> User: "I want a protocol that emails me whenever someone fills out the form."
>
> You: That's catalyst-shaped, not protocol-shaped — the work happens *after* the conversation, it's operator-initiated, and it touches an external system with credentials. The \`formGathering\` protocol you already have captures the submission; a catalyst is what routes the captured data outward. Want me to walk you through \`recommend_catalysts\` instead? If you want to *contribute* a new catalyst back to mojulo's library, that's \`custom_catalyst\`.

---

## The mental model — three properties that drive the design

If your protocol idea violates any of these, the design is probably wrong. Test against all three before drafting.

1. **Stackable, not switched.** Bots are rarely "just knowledge" or "just forms." A clinic bot wants knowledge + forms + appointments; a concierge wants knowledge + triage. The composer takes an \`{ knowledge, formGathering, appointments, triage, opticalRead, <yours> }\` toggle map and **concatenates** the matching cartridges. Adding a sixth capability is a new file + a registry entry, not a refactor.
2. **Prose AND response shape come out together.** Every protocol that asks the LLM to *do* something also adds *fields the LLM must return*. Forms need \`formTracker\`. Appointments need \`calendarId\`. Triage needs \`deploymentId\`. Optical-read needs \`extractedFields\`. If your protocol adds new behavior but no envelope fields, you don't have a protocol — you have an identity-prompt tweak. If it adds new fields, both halves get composed from the same toggle map and ship as one document.
3. **The artifact is the contract.** The wizard and chat builder are convenience layers; they produce the same \`instructions.txt\` + envelope a hand-author would. So the engineering question for a new protocol is narrow: **can you get an LLM to emit your new top-level envelope field reliably, given a hand-crafted prompt?** If yes, the wiring through the composer and builders is mechanical. If no, no amount of plumbing fixes flaky prose.

---

## Step 1 — Validate the intent loop on hand-authored instructions, BEFORE touching the composer

This is the single most load-bearing piece of protocol design and the step that gets skipped most often. Steps 2-onward wire a *working* cartridge into the system; they do not make a flaky cartridge less flaky.

**What "the intent loop" means:** a turn comes in, the LLM reads \`instructions.txt\`, matches the user's input against your protocol's inline data, and emits an envelope with your new top-level field (\`yourField\`, \`appointment.calendarId\`, \`triage.deploymentId\`) **populated when expected and empty otherwise**.

Validate this **without** the composer, **without** the wizard, **without** the chat builder, on an unzipped \`lite-template/\`:

1. Hand-author \`config/instructions.txt\`: start with the contents of \`00_base.txt\` (the safety floor every bot ships with), append your cartridge prose, then your inline data pasted under a \`## <YOUR_PROTOCOL>\` header, then a \`## RESPONSE FORMAT PROTOCOL\` block listing your new field alongside \`answer\` and \`suggestions\`.
2. Point \`config/config.json\` at an **OpenAI or Ollama** provider. **Do NOT use Anthropic for this step.** Anthropic's forced tool use enforces the canonical envelope schema with \`additionalProperties: false\` and silently drops fields you haven't added there yet — you'll think your protocol is broken when actually the wire layer is filtering it. OpenAI and Ollama extract via prose, so they pass new fields through unchanged.
3. \`npm install && npm start\`, POST to \`/api/chat\`, inspect responses. Tune cartridge prose and inline-data shape until your field fires consistently on the inputs you expect and stays empty on the ones you don't.

Encourage the user to do this **before** any composer/wizard wiring. If they can't get the intent firing here, every other step is wasted work. The composer just hands the same prompt to the same model.

---

## Step 2 — Design the inline data shape

Each existing protocol ships per-deploy data alongside its prose, **stripped to the minimum the LLM needs**:

- \`formGathering\` → form structure stripped to \`id, label, condition, required\`. Field types, validation, UI hints stay on the frontend.
- \`appointments\` → calendar destinations as-is (small shape, no leakable secrets).
- \`triage\` → routes stripped to \`deploymentId, name, description\`. The \`url\` field is **deliberately excluded** — it's a client-side redirect handle, and keeping it out of the prompt prevents the LLM from emitting raw URLs in \`answer\` text.
- \`opticalRead\` → extraction fields stripped to \`idName, label, hint\`. Wizard widget metadata stays out.

For the user's protocol, design a \`build<Name>Section()\` helper that takes per-deploy config and returns either a header + JSON section or an empty string on missing/invalid input. **Strip aggressively.** Never leak URLs, credentials, or rendering-side metadata into the prompt — they cost tokens and tempt the LLM to leak them back out in \`answer\`.

---

## Step 3 — Design the response attribute group

If the protocol adds envelope fields (it almost certainly does — that's the engineering question of step 1), it adds a \`<NAME>_ATTRIBUTES\` group to the response-builder. **Use inline descriptions as values**, not a separate description block:

\`\`\`js
const YOUR_ATTRIBUTES = {
  yourField: 'description of what the LLM should put here',
  yourFlag: 'true/false',
  // ...
};
\`\`\`

The LLM sees the field name AND a hint about what to put there in one place. Easier to keep in sync than two parallel documents.

Watch for the \`suggestions\` collision pattern: \`formGathering\` and \`triage\` both override the core \`suggestions\` description with one specific to that protocol. Last write wins in protocol order. If the user's protocol has its own preferred phrasing for \`suggestions\`, mention this — they may want to override.

Knowledge protocol adds **no** response attributes — it shapes how \`answer\` should be written (paragraph length, RAG anchoring) but doesn't introduce new fields. That's a legitimate shape too, but rarer; most useful protocols emit at least one new envelope field.

---

## Step 4 — Map the touch points

A new protocol, end to end, touches these files:

| File | What to add |
|---|---|
| \`control/lib/composer/protocols/XT_<name>.txt\` | The cartridge prose. Imperative voice, blunt, no preamble — written for the LLM, not for a human reader. |
| \`control/lib/composer/composer.js\` | Entries in \`PROTOCOL_FILES\` (the toggle-to-file map) and \`PROTOCOL_ORDER\` (the deterministic stacking order). If the protocol needs inline data, write a \`build<Name>Section()\` helper here too. |
| \`control/lib/composer/response-builder.js\` | The \`<NAME>_ATTRIBUTES\` group from step 3 + a conditional \`Object.assign\` in \`buildResponseFormatSection\` keyed on the toggle. |
| \`lite-template/helper/envelope-schema.js\` | Add the new top-level fields to the canonical envelope. **Without this, Anthropic forced tool use silently drops them at the wire.** |
| \`control/lib/envelope-schema.js\` | **Mirror the same change.** This file is duplicated by hand — there is no shared layer between control plane and bot runtime. Missing the mirror is a common rake. |
| Wizard step + chat-builder tool | Both write to the same \`enabledProtocols.<name>\` toggle and the same \`protocolData.<name>\` bucket so the composer doesn't care which builder produced the config. |
| \`control/lib/llm-providers.js\` (maybe) | Decide whether \`RESTRICTED_OLLAMA_MODELS\` (qwen3, mistral-nemo) can run the new protocol. If it's tool-use-heavy (multi-step state tracking like forms / appointments / triage / optical-read), leave the allowlist alone and it's implicitly gated off for small Ollama models. If it's knowledge-style (RAG + free text, no multi-step state), add the protocol ID to the allowlist. |

What you do **not** touch: the deployer, the bot runtime, the prompt assembler, the response parser. Past \`composeInstructions\`, nothing branches on which protocols are on. The composed \`instructions.txt\` is the contract, and a new file with a new toggle is enough.

---

## Step 5 — Hand off

When you've walked the user through the design, tell them:

- This is a **code change to mojulo**, not a config — there are two paths:
  - **Fork.** Keep the protocol in the user's fork; deploy bots from there. Right path for bespoke / client-specific capabilities.
  - **Upstream PR** against https://github.com/zombico/mojulo. The bar is "broader applicability than one workflow." The existing five cleared it; a sixth has to too.
- The most likely failure mode is **skipping step 1** (validating the intent loop on hand-authored instructions). Encourage the user to prove the intent fires on OpenAI or Ollama before wiring anything else.
- The second most likely failure mode is **forgetting the envelope-schema mirror**. Both files have to change in lockstep, or Anthropic deploys silently drop the new fields.
- If the user is not confident their idea clears the upstream bar, point them at the catalyst path instead — local skills synthesized from catalysts cover the "I want this for my specific bot" case without changing mojulo's runtime.

---

## Anti-patterns — things NOT to do

- **Don't add credentials or destination URLs to the cartridge prose or inline data.** Those belong in catalysts, not protocols. The architecture deliberately keeps the bot runtime free of integration credentials so the bot stays portable.
- **Don't add a protocol that only rewords the bot's answer.** Identity prompts and the objective string handle phrasing. A protocol is justified by *new envelope state* or *new multi-turn structure*, not by tone.
- **Don't propose a protocol when you mean a catalyst.** Walk Step 0 carefully. "I want my bot to send X to Y" is almost always a catalyst.
- **Don't skip the envelope-schema mirror.** Update both \`lite-template/helper/envelope-schema.js\` AND \`control/lib/envelope-schema.js\`. Anthropic enforces the canonical schema at the wire; missing fields are dropped silently and the bot looks broken with no error.
- **Don't ship a protocol whose intent loop only works on one model.** A capability that fires reliably on gpt-5 but flakes on Claude Sonnet 4.5 isn't ready. Tune the cartridge prose until it works across the providers mojulo supports — or scope the protocol to the providers that can carry it.

---

## Final reminders

- **The cartridge prose is read by an LLM, not a human.** Short lines, imperative voice, no preamble. Look at the existing five cartridges for the texture — bluntness is a feature.
- **Stripping is a discipline.** Every byte in the prompt either earns its tokens by helping the LLM make a decision, or it doesn't. Inline-data helpers exist to strip aggressively.
- **The artifact is the contract.** A bot whose \`instructions.txt\` was written by hand is indistinguishable at runtime from one the wizard produced. The composer, wizard, and chat builder exist for ergonomics; they don't improve how reliably the intent fires.
`;

export async function customProtocolHandler(_input, _ctx) {
  // Plain text content (not JSON-stringified) so the agent reads it as prose.
  return { content: [{ type: 'text', text: CUSTOM_PROTOCOL_GUIDE }] };
}

export function registerContextTools() {
  registerTool({
    name: 'forward_context',
    description:
      "Forward the agent the full mojulo orientation: concept glossary (bot, deployment, protocol, chain, catalyst), the build → deploy → connect → operate lifecycle, and a one-line description of every tool in this MCP. Call this FIRST whenever the user asks what mojulo is, how it works, or which tool to pick — or whenever you (the agent) feel uncertain about mojulo's vocabulary or which entry point fits the user's intent. Read-only, no inputs, idempotent.",
    inputSchema: { type: 'object', properties: {} },
    handler: forwardContextHandler,
  });

  registerTool({
    name: 'custom_protocol',
    description:
      "Return an author's guide for designing a new mojulo PROTOCOL — a bot capability that fires inside a conversation (every turn, in the LLM's envelope). Use this when the user wants to extend what their bot does *during a turn*: recognize a new intent class, collect a new shape of structured data across turns, render a new UI affordance via the envelope, read a new modality. Do NOT call this when the user wants something that happens *after* the conversation (CRM sync, weekly digests, log scans, ticket-on-signal) — that's catalyst-shaped, route to recommend_catalysts / custom_catalyst instead. The guide opens with a posture check disambiguating protocol vs. catalyst vs. identity-prompt-tweak (the most common misfire is calling this when the user actually wants a catalyst), then walks the mental model (stackable cartridges + composed response envelope, prove the intent loop on hand-authored instructions before wiring), then the touch-point map (cartridge file, registry entry, response attributes, envelope schema mirror, builder hooks). The output of this workflow is a design the user takes to a fork or an upstream PR — not a single file like custom_catalyst produces. Read-only, no inputs, idempotent.",
    inputSchema: { type: 'object', properties: {} },
    handler: customProtocolHandler,
  });
}
