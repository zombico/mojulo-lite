---
name: write-catalyst
description: Draft a new mojulo catalyst (a curated workflow recipe shipped via MCP) into control/lib/mcp/catalysts/. Push back when the request isn't catalyst-shaped — when it's actually a mojulo protocol, a one-off user skill, a bot-side write, or too thin on mapping insight to earn a shelf spot. Invoke as `/write-catalyst` (the skill prompts for intent) or `/write-catalyst <one-line intent>`.
---

# /write-catalyst

Draft a new catalyst file in [control/lib/mcp/catalysts/](control/lib/mcp/catalysts/) following the format, body principles, and section template documented in [docs/catalysts.md](docs/catalysts.md). Validate it parses, update the loader test, and hand back to the user for PR.

The catalyst paradigm: a `.md` file with JSON frontmatter that mojulo ships through MCP so a user's Claude Code can read it once and *catalyze* the synthesis of a concrete `.claude/skills/<name>/SKILL.md` for that user's bot. The catalyst is not a skill; it produces a skill. Keep this distinction sharp throughout — if you blur it, the body you draft will be wrong.

## Read these first (every invocation)

Always pull these into context before drafting anything:

- [docs/catalysts.md](docs/catalysts.md) — the author spec. Format, validation, body principles, the six-section template, the checklist for adding a new one.
- [control/lib/mcp/tools/catalysts.js](control/lib/mcp/tools/catalysts.js) — read `SYNTHESIZER_BRIEFING`. The body you draft is read by a future Claude *after* that briefing is prepended, so don't repeat what the briefing already says.
- [control/lib/mcp/catalysts/loader.js](control/lib/mcp/catalysts/loader.js) — exact validation rules. Your draft must pass `parseCatalystFile`.
- All existing `.md` files in [control/lib/mcp/catalysts/](control/lib/mcp/catalysts/) — these are the exemplars. Bias toward the one closest in category to the user's intent and study its mapping intent, idempotency, and pitfalls sections specifically. The value-add of those sections is what separates a real catalyst from a hollow one.

Don't skim. The body you write is a prompt that has to teach a future Claude how to synthesize a working skill on first try. The exemplars show the bar.

## Step 1 — Posture-check (push back here, before gathering anything)

A catalyst is the **wrong tool** in these cases. If any apply, stop and tell the user — don't try to force the request into a catalyst shape.

1. **The request changes what the bot *does* during a conversation.** That's a mojulo protocol, not a catalyst. Point the user at [docs/protocol-composition.md](docs/protocol-composition.md) ("Before adding a protocol — could a catalyst do this?"). Short version of the rubric: protocols change what the bot does *inside* a conversation; catalysts change what happens with the bot's data *afterward*.
2. **The workflow writes back to the bot's corpus or config.** Explicitly forbidden by body principle 4 in [docs/catalysts.md](docs/catalysts.md). Catalysts read from mojulo and write to *destinations* only.
3. **The request is bot-specific or one-off.** Catalysts are shipped library entries — they have to be reusable across bots and users. If it's bespoke, the user should just have Claude synthesize a `.claude/skills/` skill directly with no catalyst — that's already a supported path (see [docs/catalysts.md:35](docs/catalysts.md#L35)).
4. **The destination is one specific MCP, not a category.** A catalyst's value is destination-agnostic mapping intent (`crm-like`, `calendar-like`, `actuator-like`, etc.). "Sync to my specific Notion database with this exact schema" is a skill, not a catalyst.
5. **The "mapping intent" is generic.** If the user can't articulate at least one non-obvious, opinionated decision the catalyst makes (a specific field-mapping choice, a default behavior, a calibration heuristic), the catalyst won't pay rent. Don't ship a body that just recites the universal principles — those already live in `SYNTHESIZER_BRIEFING`.
6. **No clear idempotency story.** Without a cursor field or a dedupe key, the Idempotency section becomes hand-waving. Push back and surface the missing decision rather than papering over it.

When pushing back, name the specific failure and suggest the right alternative (protocol PR, local skill, more specific request). Don't soften the pushback — the library is curated; a thin catalyst dilutes it.

## Step 2 — Gather context (one batched round)

If posture-check passes, ask the user the following in one message. Don't drip questions out one at a time. Skip questions the user already answered in their invocation line.

1. **Workflow intent in one paragraph.** What mojulo data → what destination concept, and the user's motivation.
2. **Mojulo source surface.** Which existing mojulo MCP tools (see [control/lib/mcp/tools/operate.js](control/lib/mcp/tools/operate.js)) does the synthesized skill call? Common shapes: `query_submissions` + `get_deployment` (form-side), `query_conversations` + `get_conversation` + `get_deployment` (conversation-side), or both.
3. **Required protocols.** Does the target bot need `formGathering`, `appointments`, `triage`, `opticalRead`, `knowledge`, or none? Separate required from optional (`requires.optionalProtocols`).
4. **Destination MCP category.** Pick from existing categories where possible: `crm-like`, `calendar-like`, `ticketing-like`, `actuator-like`, `doc-or-channel-like`, `data-store-like`. If proposing a new category, the user must justify why none of the existing ones fit — don't proliferate categories.
5. **Catalyst category (the `category` frontmatter field).** Existing categories: `crm-sync`, `itsm`, `calendar`, `digest`, `analysis`, `rag-curation`, `extraction-pipeline`. Same discipline as above — six-ish is enough; ask before adding a new one.
6. **Mapping insight — the value-add.** What's the specific, opinionated decision this catalyst encodes that a future Claude would otherwise have to guess at? At least one. If the user gives a generic answer ("map the fields to the destination"), push back to step 1's failure mode 5.
7. **Idempotency strategy.** Cursor field (usually a submission/conversation timestamp via a `since` input) AND dedupe key (usually a destination-side search-before-create on a stable id).
8. **Pitfalls.** PII exposure, irreversible writes, rate limits, calibration drift are the universal ones — surface those automatically. Ask the user for any domain-specific pitfalls (timezone bugs, confidence thresholds, schema drift).
9. **Parameters to ask the user at synthesis time.** Each `parameters[]` entry the synthesized skill will need to be parameterized over (`name`, `prompt`, optional `default`). Typically 2-4. If you're proposing more than 5, push back — long parameter lists usually mean the catalyst is trying to do two things.

## Step 3 — Pick the id and slug

The `id` is the file slug and frontmatter `id`. Conventions from the existing library:

- kebab-case, descriptive, ≤ ~40 chars
- shape: `<source>-to-<destination>` (e.g. `qualify-lead-to-crm`, `appointment-to-calendar`) or `<verb>-<source>-<modifier>` (e.g. `scan-conversations-for-signal`, `knowledge-gap-miner`)
- must not collide with an existing id in [control/lib/mcp/catalysts/](control/lib/mcp/catalysts/) — the loader throws on duplicates

Check `ls control/lib/mcp/catalysts/*.md` before committing to a slug.

## Step 4 — Draft the file

Path: `control/lib/mcp/catalysts/<id>.md`.

### Frontmatter

JSON, between two `---` fences. Required: `id`, `name` (human-readable title), `summary` (one line, used in `list_catalysts`). Optional: `version` (default 1), `category`, `requires.protocols`, `requires.optionalProtocols`, `requires.destinationMcpCategory`, `parameters`, `mcpTools.mojulo`, `mcpTools.destination.description`.

The `mcpTools.destination.description` field is *abstract* — describe the shape of MCP the synthesized skill needs and name 2-4 example MCPs that fit. Do not bind to a specific MCP.

### Body — the six-section template

Follow the structure in [docs/catalysts.md:121-127](docs/catalysts.md#L121-L127). Every existing catalyst follows it. Don't deviate without reason.

1. **Opening paragraph** — what this catalyst does, plain English, ~2-3 sentences. Frame the source protocol or data shape it operates on.
2. **How to synthesize the skill** — numbered steps. First step is almost always `get_deployment(deploymentId)` to read the bot's shape. Then "ask the user the N `parameters` questions" (batched). Then "inspect the bound destination MCP" to discover its concrete surface. Last step: where to write the file (`.claude/skills/<bot-slug>-<purpose>/SKILL.md`) — name the slug pattern.
3. **Mapping intent** — the load-bearing section. Specific field-to-field guidance, what to do when a field doesn't fit, when to ask the user vs. when to assume. This is where the value-add lives. Be concrete — quote field names, name destination shapes.
4. **Idempotency** — cursor strategy AND dedupe key. Always pair them — the cursor is the primary defense, search-before-create is the safety net.
5. **Pitfalls** — bullets, each with a specific mitigation (not just the risk). At minimum touch on: PII exposure (especially anything where the LLM reads form/conversation content), irreversible writes (default `dryRun: true`, opt-in to live), rate limits, calibration drift. Add domain-specific pitfalls the user surfaced.
6. **Skill behavior contract** — bullets for `Inputs:`, `Outputs:`, `Side effects (live mode):`. Inputs always include `deploymentId` (required), `since` (optional ISO), `dryRun` (default true).

### Body principles to enforce (from [docs/catalysts.md:129-135](docs/catalysts.md#L129-L135))

- Default `dryRun: true` in the contract. Live mode is per-run opt-in.
- Always require mojulo trace (submission id, conversation id, deployment id, captured-at) in destination payloads.
- Surface PII concerns explicitly when the synthesized skill will read form/conversation content through the LLM.
- Don't write back to the bot. Catalysts read from mojulo, write to destinations.
- Sample, don't sweep. Analytical catalysts default to bounded samples (typically 30) — the user graduates after calibration.

These principles also live in `SYNTHESIZER_BRIEFING`, which is prepended to every `get_catalyst` response. Don't restate the briefing's content in the body — it's already there. Body content should be the *specific* application of these principles to this catalyst's domain.

### What NOT to write in the body

- Don't restate the vocabulary disambiguation (catalyst vs. skill vs. protocol). `SYNTHESIZER_BRIEFING` already does that.
- Don't restate the "adapt freely, posture is starting point not contract" preamble. Same reason.
- Don't pad sections that don't apply. If a catalyst has no meaningful trend-delta concern, skip it — don't fabricate one.

## Step 5 — Self-validate the draft

Before reporting back to the user, validate the draft parses:

```bash
cd control && npx vitest run lib/mcp/catalysts/loader.test.js
```

Two things will happen:

1. **The loader parses your file at startup** — if frontmatter is malformed, required fields are missing, or the body is empty, the test fails with a clear error pointing at your file. Fix and re-run.
2. **The "canonical catalysts we expect to ship" assertion will fail** — the test in [control/lib/mcp/catalysts/loader.test.js](control/lib/mcp/catalysts/loader.test.js) (around line 68-83) has a hardcoded sorted list of expected ids. You added a new one — update that list to include your new id (keep it sorted). This is documented in the catalyst-adding checklist ([docs/catalysts.md:151-157](docs/catalysts.md#L151-L157)).

Re-run the test after updating; it should pass green. If it doesn't, fix and re-run — don't ship a draft that fails the loader.

## Step 6 — Hand off to the user

Tell the user:

- Where the file is (`control/lib/mcp/catalysts/<id>.md`)
- Which loader-test edit you made (the expected-ids list)
- That the next step is to **PR the catalyst + the test update** per the checklist in [docs/catalysts.md:151-157](docs/catalysts.md#L151-L157)
- If the new catalyst's category surfaces a discoverability gap (e.g. it's the first `itsm` catalyst, or you proposed a new category), mention that [docs/mcp-integration.md](docs/mcp-integration.md) recipes section may want a mention — but don't auto-edit it, that's a user call.

## Final reminders

- **Read the exemplars every time.** The skill's quality scales with how closely you match the existing tone, density, and opinionatedness of the shipped catalysts. Don't trust your prior; re-read.
- **Push back early.** Once you've drafted a hollow catalyst, it's hard to un-write. The pushback in Step 1 is the most valuable thing this skill does.
- **The body is a prompt, not documentation.** The reader is a future Claude trying to write a working skill in one pass. Optimize for their decisions, not the user's understanding.
