# Catalysts

A **catalyst** is a curated workflow pattern that mojulo ships through MCP. The user's Claude Code reads a catalyst, introspects a deployed bot's shape, picks a destination MCP from what's installed locally, and synthesizes a concrete skill into `.claude/skills/`. The synthesized skill is the user's — they edit, version-control, and iterate on it directly. Mojulo's role ends at handing over the catalyst.

The name is deliberately bare — not "skill catalyst." Catalysts **produce** skills; they are not themselves skills, and treating them as a sub-type of skill blurs the boundary the design depends on. The bifurcation is load-bearing: catalysts are a separate concept that exists at a different layer (mojulo-side workflow patterns) from the artifact they help create (user-side Claude Code skills).

The "catalyst" name is also literal as a metaphor. Each file enables one phase transition from a vague user intent + a bot's shape + a destination MCP into a structured skill artifact. The catalyst itself is not consumed (the file persists and can catalyze again for the next bot) and does not appear in the resulting skill — it's the nucleation point that lets the skill crystallize out. Earlier drafts called these "seeds," which implied growth and lifecycle; the rename captures what actually happens at synthesis (one-shot crystallization).

This document is the **author** spec: format, validation, and the principles a good catalyst body follows.

For the **user-facing** explanation (what catalysts are, how to invoke the flow from Claude), see the "Catalysts" section of [docs/mcp-integration.md](mcp-integration.md).

---

## Three concepts, kept distinct

Three terms in this space overlap and need to be kept separate by authors and by the model reading the catalysts. If you're weighing whether to **add a new mojulo protocol** vs. **write a catalyst** for a given use case, see the decision rubric in [docs/protocol-composition.md](protocol-composition.md) under "Before adding a protocol — could a catalyst do this?" — short version: protocols change what the bot does inside a conversation, catalysts change what happens with the bot's data afterward.

| Concept                   | Where it lives                                              | What it is                                                                                                                                                       | Lifecycle                                                                                  |
| ------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Mojulo protocol**       | [control/lib/composer/protocols/](../control/lib/composer/protocols/) | A *bot's* runtime capability — `knowledge`, `formGathering`, `triage`, `appointments`, `opticalRead`. Composed into the bot's `instructions.txt` at build time. | Set when the bot is built. Read off a deployment via `get_deployment`.                     |
| **Claude Code skill**     | User's `.claude/skills/<name>/SKILL.md`                     | A *user-owned local file* that Claude Code reads and executes when invoked. Parameterized procedure that calls MCP tools (mojulo's and others) to do work.       | Synthesized once from a catalyst; owned and edited by the user thereafter. Mojulo never sees it. |
| **Catalyst** (this doc)   | [control/lib/mcp/catalysts/](../control/lib/mcp/catalysts/) | A *workflow recipe* mojulo ships through MCP. Consumed once at synthesis time to catalyze a Claude Code skill. The catalyst is not the skill; the catalyst tells Claude how to write the skill. | Lives in the repo. Read once per synthesis via `get_catalyst`.                          |

Every `get_catalyst` response prepends a briefing that restates this distinction to the synthesizing model — the framing lives in [control/lib/mcp/tools/catalysts.js](../control/lib/mcp/tools/catalysts.js) as `SYNTHESIZER_BRIEFING`. The briefing also opens with a **posture preamble** that explicitly authorizes the model to treat the catalyst as a starting point rather than a rigid recipe: adapt freely, combine elements across catalysts, write from scratch when no catalyst fits, and carry forward the catalyst's pitfall reasoning even when deviating from its prescribed flow. The only non-negotiables are the safety defaults: `dryRun: true` for external writes, and mojulo trace fields (deployment id, conversation id, submission id, captured-at) in every destination payload.

When writing a catalyst body, you can assume the reader has just been (a) reminded which is which and (b) told it's free to deviate. Don't waste body space repeating either — focus on the *thinking* (mapping intent, idempotency strategy, pitfalls) that earns the catalyst its place in the library.

---

## Where catalysts live

`control/lib/mcp/catalysts/` — one `.md` file per catalyst, shipped with the repo. The loader scans this directory at process start and exposes the library via two MCP tools.

**There is no user-writable catalyst directory.** This is a deliberate scope choice — catalysts are an MCP affordance, and custom or one-off patterns belong in Claude Code, not in mojulo's storage. Users wanting a bespoke workflow either let Claude synthesize from scratch (no catalyst needed) or maintain their own catalyst-shaped markdown locally for Claude to consume.

To add a new built-in catalyst: write the `.md` file, restart the control plane, send a PR.

---

## File format

JSON frontmatter between two `---` fences, then a markdown body:

```markdown
---
{
  "id": "qualify-lead-to-crm",
  "name": "Qualify lead and sync to CRM",
  "summary": "Score new submissions...",
  "version": 1,
  "category": "crm-sync",
  "requires": {
    "protocols": ["formGathering"],
    "destinationMcpCategory": "crm-like"
  },
  "parameters": [
    {
      "name": "qualifyingCriteria",
      "prompt": "What makes a 'qualified' submission for your business?"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_deployment"],
    "destination": {
      "description": "A CRM-like MCP exposing search-by-property + contact create."
    }
  }
}
---

# Title

Body markdown — the prompt Claude reads at synthesis time.
```

JSON, not YAML, is intentional: dep-free parsing, unambiguous types, fails loudly on malformed input.

### Required fields

- `id` (string) — slug, unique across the library
- `name` (string) — human-readable title
- `summary` (string) — one-line description, used in `list_catalysts`

### Optional fields

- `version` (number, default 1) — bump when the body changes meaningfully
- `category` (string) — filter axis for `list_catalysts`. Existing categories: `crm-sync`, `itsm`, `calendar`, `digest`, `analysis`, `rag-curation`
- `requires.protocols` (string[]) — mojulo protocols the target bot must have enabled
- `requires.optionalProtocols` (string[]) — protocols that enrich the catalyst but aren't required
- `requires.destinationMcpCategory` (string) — what kind of destination MCP the synthesized skill needs (e.g., `crm-like`, `ticketing-like`, `calendar-like`)
- `parameters` (object[]) — questions Claude asks the user during synthesis. Each entry: `{ name, prompt, default? }`
- `mcpTools` (object) — declares the tool surface the synthesized skill uses. `mcpTools.mojulo` is the array of mojulo MCP tools; `mcpTools.destination.description` is the abstract description of the destination MCP

### Body

Everything after the closing `---`. The body is **the value of the catalyst** — it's a prompt that Claude reads to write the user's skill. Validation requires a non-empty body.

---

## Validation

The loader fails fast on:

- Missing frontmatter fences
- Malformed JSON
- Missing `id` / `name` / `summary`
- Empty body
- Duplicate `id` across files

Since the library is curated (not user input), validation faults are PR bugs — the error reports the file path and the field for fast diagnosis.

---

## What makes a good catalyst body

The body is a prompt. Claude is the reader. The user is not — they only see the synthesized skill. Optimize for Claude's ability to produce a working skill on first try.

Each body should cover:

1. **What this skill does** — one paragraph, plain English.
2. **How to synthesize the skill** — the concrete steps Claude takes (which tools to call, what to ask the user, where to write the skill file). This is the load-bearing section.
3. **Mapping intent** — how mojulo data maps to the destination's concepts. The catalyst's value-add is *avoiding the user from teaching Claude the mapping from scratch*. Be specific: which fields map to what, what to do when a field doesn't fit, when to ask vs. when to assume.
4. **Idempotency** — re-run behavior. What's the cursor strategy? What's the dedupe key? What's the safety net if the cursor fails?
5. **Pitfalls** — failure modes that aren't obvious. PII concerns, rate limits, irreversible writes, calibration issues. Each pitfall should suggest a mitigation, not just flag the risk.
6. **Skill behavior contract** — inputs, outputs, side effects, default `dryRun` behavior.

### Body principles

- **Default `dryRun` to true.** Any catalyst that writes externally should produce a skill that defaults to dry-run, with the user opting into live writes explicitly. The user can override that default after synthesis, but the synthesized default is conservative.
- **Always require mojulo trace in destination payloads.** Submission id, conversation id, deployment id, captured-at timestamp. The reviewer on the destination side needs to be able to walk back to the source — this is the differentiator vs. opaque integration platforms.
- **Surface PII concerns.** Multiple catalysts pull form/conversation content back through the LLM at routing time. The bot's data-handling posture was set at capture time; skill synthesis is a place to reaffirm the user is OK with the new exposure.
- **Don't auto-write to the bot.** Catalysts read from mojulo, write to destinations. No catalyst should reach into the bot's corpus or config — those paths stay user-mediated.
- **Sample, don't sweep.** Analytical catalysts (signal scanning, gap mining) should default to bounded samples. Full-scan defaults produce surprise LLM bills.

---

## MCP surface

Two tools, registered by [control/lib/mcp/tools/catalysts.js](../control/lib/mcp/tools/catalysts.js):

| Tool              | Purpose                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `list_catalysts`  | Returns `id`, `name`, `summary`, `category`, `requires` for each catalyst. Optional `category` filter.   |
| `get_catalyst`    | Returns the full catalyst including `body` for one `id`.                                                  |

Bot-shape introspection is intentionally not a separate tool — `get_deployment` ([control/lib/mcp/tools/operate.js](../control/lib/mcp/tools/operate.js)) already returns enabled protocols, form schema, triage routes, and identity. Claude does the match between a catalyst's `requires` and a deployment's shape.

---

## Adding a new catalyst (checklist)

1. Pick an unused `id` (slug).
2. Write `control/lib/mcp/catalysts/<id>.md` following the format above.
3. Pick or reuse a `category`. Don't proliferate categories — six should cover most workflows.
4. Run `npx vitest run lib/mcp/catalysts/loader.test.js` from `control/` — the loader test will fail-load if the file is malformed and will assert the catalyst is in the expected library set (update the list in the test).
5. PR the catalyst file + the test update. No code change to the loader or the MCP tools is needed.
