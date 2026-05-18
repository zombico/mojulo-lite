/**
 * MCP Ring 3 — catalysts.
 *
 * Exposes the curated library of workflow patterns shipped with mojulo. The
 * user's Claude calls `list_catalysts` to discover what patterns exist,
 * `get_catalyst` to read the full prose body for a chosen pattern, then
 * combines that with `get_deployment` (operate ring) and its own installed
 * MCPs to synthesize a concrete skill into the user's `.claude/skills/`.
 *
 * The "catalyst" framing is literal: each pattern enables one phase transition
 * from user intent + bot shape + destination MCP into a structured skill
 * artifact. The catalyst itself is not consumed and does not appear in the
 * resulting skill.
 *
 * The term is deliberately bare — not "skill catalyst" — so the concept stays
 * conceptually distinct from the skill it produces. Catalysts catalyze skills;
 * they are not themselves skills.
 *
 * Catalysts are read-only from MCP. Authoring lives in the repo
 * ([control/lib/mcp/catalysts/](control/lib/mcp/catalysts/)) — see
 * [docs/catalysts.md](docs/catalysts.md).
 */

import { getCatalyst, getCatalystCatalog, listCatalysts } from '@/lib/mcp/catalysts/loader';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { registerTool } from '@/lib/mcp/server';

// Prepended to every catalyst body returned by get_catalyst. Two jobs:
//
//   1. Posture preamble — explicitly authorize the model to treat the catalyst
//      as a starting point and apply judgment. Without this, models tend to
//      recite the recipe even when the user's situation doesn't fit. Strategic
//      nudge: catalysts are inspiration + tested patterns, not contracts.
//
//   2. Vocabulary disambiguation — three terms in this space ("skill",
//      "protocol", "catalyst") overlap enough that the model needs grounding
//      on each read, not just once in a tool description it may not re-consult
//      mid-task.
//
// Exported for tests.
export const SYNTHESIZER_BRIEFING = `# How to read this catalyst — posture first

This catalyst is a **starting point, not a contract.** The library is non-exhaustive. Treat it as a worked example to learn from, not a recipe to recite.

- **Adapt freely.** Combine elements across catalysts, skip sections that don't apply to the user's situation, add steps the catalyst didn't anticipate. The value is its *thinking* — mapping intent, idempotency strategy, pitfalls — not its literal prose.
- **No catalyst fits the user's intent? Write from scratch.** Don't force a mismatched pattern onto the user's request. Synthesize directly from their goal and the bot's shape, drawing on judgment absorbed from any catalysts you've read.
- **Pitfalls in the body still apply when you adapt.** The PII-through-the-LLM warnings, rate-limit notes, irreversible-write cautions, and calibration advice generalize across patterns — they're not catalyst-specific gotchas. Carry them forward even when you deviate from the catalyst's prescribed flow.
- **Safety defaults are standing posture, not negotiable.** Regardless of path: (1) default \`dryRun: true\` for any external write, requiring explicit per-run opt-in for live mode; (2) include mojulo trace (deployment id, conversation id, submission id, captured-at) in every destination payload so reviewers can walk back to the source.

---

# Vocabulary — three concepts kept distinct

Three terms easy to confuse. The term **catalyst** is intentionally bare — not prefixed with "skill" — because catalysts produce skills; they are not themselves a sub-type of skill:

- **Mojulo protocols** are a *bot's* runtime capabilities (\`knowledge\`, \`formGathering\`, \`triage\`, \`appointments\`, \`opticalRead\`). A deployed mojulo bot has zero or more enabled — they determine what the bot does when it talks to end users. The \`requires.protocols\` field in this catalyst's metadata names which protocols the target bot must have for it to apply. You read enabled protocols off a deployment via \`get_deployment\`.
- **A Claude Code skill** is a *user-owned local file* (\`.claude/skills/<name>/SKILL.md\`) that you (Claude) read and execute when invoked in a Claude Code session. The skill is the artifact you are about to **synthesize and write to disk**. Mojulo does not host, execute, or store skills — once you write it, it belongs entirely to the user.
- **This document** is a *mojulo catalyst* — a workflow recipe mojulo ships through MCP. The name is literal: you read it once to **catalyze** the synthesis of a skill from the user's intent, the bot's shape, and the destination MCP. The catalyst itself doesn't end up in the resulting skill — it's the nucleation point that lets a structured skill crystallize out. After synthesis, the catalyst is no longer referenced. Catalysts are not a sub-type of skill; they're a separate concept that *produces* skills.

Your job: combine this catalyst's body (or your judgment-driven adaptation of it), the target bot's shape (from \`get_deployment\`), and the destination MCP the user has installed locally → write a concrete \`SKILL.md\` (plus any helper files) into \`.claude/skills/\`.

---

`;

export async function listCatalystsHandler(input, _ctx) {
  const { category } = input || {};
  const catalysts = listCatalysts({ category });
  return { total: catalysts.length, catalysts };
}

export async function getCatalystHandler(input, _ctx) {
  const { id } = input || {};
  if (!id) throw new Error('id is required');
  const catalyst = getCatalyst(id);
  if (!catalyst) throw new Error(`Catalyst not found: ${id}`);
  return { ...catalyst, body: SYNTHESIZER_BRIEFING + catalyst.body };
}

// Returned by custom_catalyst. The audience here is the **opposite** of the
// in-repo /write-catalyst skill's audience: this body is for a Claude Code
// session connected to mojulo over MCP whose user wants to contribute a new
// catalyst back to the library. They do not have the mojulo repo, the spec
// doc, the loader, or the exemplar files on disk — so this body has to be
// self-contained. The exemplars are reachable via the existing `get_catalyst`
// tool; we point at them rather than inlining them.
//
// Exported for tests.
export const CUSTOM_CATALYST_GUIDE = `# Drafting a custom catalyst — author's guide

You are about to help the user draft a new mojulo catalyst — a curated workflow recipe that ships through this MCP. Catalysts you author here are **proposals** to the mojulo library. If a maintainer accepts the PR, your catalyst ships to every mojulo user as a peer of the canonical entries. That is the bar to write to.

A catalyst is *not* a Claude Code skill, *not* a mojulo bot capability ("protocol"), and *not* a one-off automation for this specific user. If you're unclear on the distinction, call \`forward_context\` first — it disambiguates all three terms.

---

## Read these first

Before you write a single line, anchor on what the bar looks like. Call:

1. \`list_catalysts\` — see every shipped pattern (id, summary, category).
2. \`get_catalyst("qualify-lead-to-crm")\` — the canonical exemplar. Study its mapping section, idempotency section, and pitfalls section specifically. That is the density you have to match.
3. \`get_catalyst("<closest existing id>")\` — whichever catalyst is closest in shape to the user's intent. If the user wants a digest pattern, read \`weekly-submissions-digest\`. If extraction, read \`document-extract-to-store\`. Etc.

The body you draft is a **prompt that has to teach a future Claude how to synthesize a working skill on first try.** It is not documentation for a human reader. The exemplars show what that looks like. Don't skim them.

---

## Step 1 — Posture-check (push back here, before gathering anything else)

A catalyst is the **wrong tool** in these cases. If any apply, stop and tell the user — don't try to force the request into a catalyst shape.

1. **The request changes what the bot *does* during a conversation.** That's a mojulo protocol, not a catalyst. Protocols change what the bot does *inside* a conversation; catalysts change what happens with the bot's data *afterward*. Protocols are a control-plane code change, not a contributor catalyst.
2. **The workflow writes back to the bot's corpus or config.** Forbidden by body principle 4 below. Catalysts read from mojulo and write to *destinations* only — never back into the bot.
3. **The request is bot-specific or one-off.** Catalysts are shipped library entries — reusable across bots and users. If it's bespoke, the user should have you synthesize a \`.claude/skills/\` skill directly with no catalyst — that's already a supported path.
4. **The destination is one specific MCP, not a category.** A catalyst's value is destination-agnostic mapping intent (\`crm-like\`, \`calendar-like\`, \`actuator-like\`, etc.). "Sync to my specific Notion database with this exact schema" is a skill, not a catalyst.
5. **The "mapping intent" is generic.** If the user can't articulate at least one non-obvious, opinionated decision the catalyst encodes — a specific field-mapping choice, a default behavior, a calibration heuristic — the catalyst won't pay rent.
   - **Bad mapping insight:** "map the form fields to the CRM contact fields by name." (The synthesizer would already do this without a catalyst.)
   - **Good mapping insight:** "HubSpot splits identity into \`firstname\`/\`lastname\` while Salesforce uses \`FirstName\`/\`LastName\` and Attio uses object/attribute pairs — synthesize the right shape from the destination MCP's surface, never assume a flat \`name\` field." (Specific, opinionated, would be guessed wrong by default.)
6. **No clear idempotency story.** Without a cursor field AND a dedupe key, the Idempotency section becomes hand-waving and the synthesized skill will double-write or skip records under real conditions.
   - **Bad idempotency story:** "the skill should be idempotent." (Aspiration, not mechanism.)
   - **Good idempotency story:** "cursor on submission \`captured_at\` via a \`since\` parameter; dedupe on the user-configured \`dedupeKey\` (typically email or phone) with a search-before-create against the destination — two layers because the cursor doesn't catch a user re-running an old window."

When pushing back, name the specific failure and suggest the right alternative (mojulo protocol PR, local-only skill, more specific request). Don't soften — the library is curated, and a thin catalyst dilutes it.

**Example pushback exchange (do this, don't fudge):**

> User: "I want a catalyst that automatically emails me a daily summary of conversations from my bot."
>
> You: That's not catalyst-shaped — it's closer to the existing \`conversations-to-channel-digest\` pattern, but as you described it, the destination is "email me" (one specific surface) and the mapping insight is "summarize the day's conversations" (generic). Two options: (a) call \`get_catalyst("conversations-to-channel-digest")\` and we synthesize a personal skill for you that emails the digest via Gmail — no PR needed; (b) if you want to *contribute* a digest variant, the value-add would need to be a specific decision the existing digest catalyst doesn't make, like "group by triage outcome" or "elevate any conversation with a low CSAT signal." Which fits?

---

## Step 2 — Gather context (one batched round)

If the posture-check passes, ask the user the following in one message. Don't drip questions out one at a time. Skip questions the user already answered in their intent.

1. **Workflow intent in one paragraph.** What mojulo data → what destination concept, and the user's motivation.
2. **Mojulo source surface.** Which existing mojulo MCP tools (\`query_submissions\`, \`query_conversations\`, \`get_deployment\`, \`get_conversation\`, etc.) does the synthesized skill call? Common shapes: form-side (\`query_submissions\` + \`get_deployment\`), conversation-side (\`query_conversations\` + \`get_conversation\` + \`get_deployment\`), or both.
3. **Required protocols.** Which mojulo bot capabilities does the target bot need enabled — \`formGathering\`, \`appointments\`, \`triage\`, \`opticalRead\`, \`knowledge\`, or none? Separate required from optional.
4. **Destination MCP category.** Pick from existing categories where possible: \`crm-like\`, \`calendar-like\`, \`ticketing-like\`, \`actuator-like\`, \`doc-or-channel-like\`, \`data-store-like\`. If proposing a new category, the user must justify why none fit — don't proliferate categories.
5. **Catalyst category (the \`category\` frontmatter field).** Existing: \`crm-sync\`, \`itsm\`, \`calendar\`, \`digest\`, \`analysis\`, \`rag-curation\`, \`extraction-pipeline\`. Same discipline — ask before adding a new one.
6. **Mapping insight — the value-add.** What's the specific, opinionated decision this catalyst encodes that a future Claude would otherwise have to guess at? Apply the bad-vs-good rubric from posture rule 5.
7. **Idempotency strategy.** Cursor field (usually a submission/conversation timestamp via a \`since\` input) AND dedupe key (usually a destination-side search-before-create on a stable id). Apply the bad-vs-good rubric from posture rule 6.
8. **Pitfalls.** PII exposure, irreversible writes, rate limits, calibration drift are universal — surface those automatically. Ask the user for any domain-specific pitfalls (timezone bugs, confidence thresholds, schema drift).
9. **Parameters to ask the user at synthesis time.** Each \`parameters[]\` entry the synthesized skill needs to be parameterized over (\`name\`, \`prompt\`, optional \`default\`). Typically 2-4. More than 5 usually means the catalyst is trying to do two things — push back.

---

## Step 3 — Pick the id and slug

The \`id\` is the file slug and frontmatter \`id\`. Conventions:

- kebab-case, descriptive, ≤ ~40 chars
- shape: \`<source>-to-<destination>\` (e.g. \`qualify-lead-to-crm\`, \`appointment-to-calendar\`) or \`<verb>-<source>-<modifier>\` (e.g. \`scan-conversations-for-signal\`, \`knowledge-gap-miner\`)
- must not collide with an existing id — check \`list_catalysts\` output before committing

---

## Step 4 — Draft the file

Save as \`<id>.md\` in a working directory the user picks (e.g. \`./catalyst-proposals/<id>.md\`). The file has two parts: JSON frontmatter between \`---\` fences, then a markdown body.

### Frontmatter (JSON, between \`---\` fences)

**Required string fields:**

- \`id\` — kebab-case slug, matches the filename.
- \`name\` — human-readable title.
- \`summary\` — one line, implementation-shaped. Used in \`list_catalysts\`.
- \`valueHook\` — one sentence in **user-outcome** terms. Read aloud by \`recommend_catalysts\` to position the catalyst *before* the user has decided to read the body. Outcome-shaped ("CRM contacts overnight, deduped and scored"), not implementation-shaped — don't just restate the \`summary\`.

**Optional fields:**

- \`version\` (number, default 1)
- \`category\` (string — see Step 2.5)
- \`requires.protocols\` (array of protocol names the target bot must have)
- \`requires.optionalProtocols\` (array — nice to have but not required)
- \`requires.destinationMcpCategory\` (one of the categories from Step 2.4)
- \`requires.destinationExamples\` — **required if \`destinationMcpCategory\` is set.** Array of 3-5 named MCPs that satisfy the category (e.g., for \`crm-like\`: \`["HubSpot", "Salesforce", "Pipedrive", "Attio", "Close"]\`). The \`recommend_catalysts\` tool surfaces these as consultation suggestions ("you could install HubSpot to unlock this") — missing or empty is a hole in the consultation posture.
- \`parameters\` (array of \`{ name, prompt, default? }\`)
- \`mcpTools.mojulo\` (array of mojulo tool names the skill calls)
- \`mcpTools.destination.description\` — *abstract* prose describing the shape of MCP needed plus 2-4 example MCPs. Do not bind to a specific MCP.

### Body — the six-section template

Every shipped catalyst follows this. Don't deviate without reason.

1. **Opening paragraph** — what this catalyst does in plain English, ~2-3 sentences. Frame the source protocol or data shape it operates on.
2. **How to synthesize the skill** — numbered steps. First step is almost always \`get_deployment(deploymentId)\` to read the bot's shape. Then "ask the user the N \`parameters\` questions" (batched). Then "inspect the bound destination MCP" to discover its concrete surface. Last step: where to write the file (\`.claude/skills/<bot-slug>-<purpose>/SKILL.md\`) — name the slug pattern.
3. **Mapping intent** — the load-bearing section. Specific field-to-field guidance, what to do when a field doesn't fit, when to ask the user vs. when to assume. This is where the value-add lives. Be concrete — quote field names, name destination shapes.
4. **Idempotency** — cursor strategy AND dedupe key. Always pair them — the cursor is the primary defense, search-before-create is the safety net.
5. **Pitfalls** — bullets, each with a specific mitigation (not just the risk). At minimum touch on: PII exposure (especially anything where the LLM reads form/conversation content), irreversible writes (default \`dryRun: true\`, opt-in to live), rate limits, calibration drift. Add domain-specific pitfalls the user surfaced.
6. **Skill behavior contract** — bullets for \`Inputs:\`, \`Outputs:\`, \`Side effects (live mode):\`. Inputs always include \`deploymentId\` (required), \`since\` (optional ISO), \`dryRun\` (default true).

### Body principles to enforce

- Default \`dryRun: true\` in the contract. Live mode is per-run opt-in.
- Always require mojulo trace (submission id, conversation id, deployment id, captured-at) in destination payloads.
- Surface PII concerns explicitly when the synthesized skill will read form/conversation content through the LLM.
- Don't write back to the bot. Catalysts read from mojulo, write to destinations.
- Sample, don't sweep. Analytical catalysts default to bounded samples (typically 30) — the user graduates after calibration.

### What NOT to write in the body

- Don't restate vocabulary disambiguation (catalyst vs. skill vs. protocol). The synthesizer briefing prepended to every \`get_catalyst\` response already does that — you'd be duplicating.
- Don't restate the "adapt freely, posture is starting point not contract" preamble. Same reason.
- Don't pad sections that don't apply. If there's no meaningful trend-delta concern, skip it — don't fabricate.

---

## Step 5 — Self-validate the draft

You can't run mojulo's test suite from here. Walk this checklist by hand before handing off:

- [ ] Frontmatter is valid JSON (parses without error).
- [ ] All four required string fields are present and non-empty: \`id\`, \`name\`, \`summary\`, \`valueHook\`.
- [ ] If \`requires.destinationMcpCategory\` is set, \`requires.destinationExamples\` is a non-empty array of strings.
- [ ] \`valueHook\` is outcome-shaped (what the *user* gets), not implementation-shaped (what the *skill* does).
- [ ] The body has all six sections in order. No section is fabricated padding.
- [ ] Mapping intent contains at least one specific, non-obvious decision (re-check posture rule 5).
- [ ] Idempotency section names both a cursor field and a dedupe key (re-check posture rule 6).
- [ ] Pitfalls section has a specific mitigation per bullet, not just a stated risk.
- [ ] Skill behavior contract names \`deploymentId\`, \`since\`, \`dryRun\` inputs.

If any check fails, fix before handing off. A maintainer's first review pass will run the same checks plus the loader's structural parse.

---

## Step 6 — Hand off to the user

Tell the user:

- Where you wrote the file in their working directory (e.g. \`./catalyst-proposals/<id>.md\`).
- That this is a **proposal** to the mojulo library, not a local skill. Accepted catalysts ship to every mojulo user.
- To contribute, open a PR against **https://github.com/zombico/mojulo** adding the file under \`control/lib/mcp/catalysts/\`. No other files need to change — the loader picks new \`.md\` files up automatically.
- The maintainers will review against the posture-check rules above and the loader's structural parse, and may push back on mapping density or value-add. If the catalyst is bot-specific or thin, expect the maintainers to suggest converting it to a local skill instead.

---

## Final reminders

- **Push back early.** Once you've drafted a hollow catalyst with the user, it's hard to un-write. The posture-check in Step 1 is the most valuable thing you do here.
- **Anchor on exemplars.** Re-read the catalysts you pulled in Step 1 before drafting each section. The skill's quality scales with how closely you match the existing tone, density, and opinionatedness.
- **The body is a prompt, not documentation.** The reader is a future Claude trying to write a working skill in one pass. Optimize for their decisions, not the user's understanding of how the catalyst works.
`;

// Returned in every recommend_catalysts response so the agent re-encounters
// the consultation posture at the moment of acting on it. Mirrors the role
// SYNTHESIZER_BRIEFING plays for get_catalyst — the rules are easier to
// follow when they sit next to the data they apply to.
//
// Exported for tests.
export const CONSULTATION_POSTURE = `# How to use these recommendations — consultation, not gatekeeping

This tool returns catalysts whose shape fits the bot you named, each annotated with a \`destinationCategory\` (the kind of MCP that satisfies it) and \`destinationExamples\` (named MCPs that fit). Mojulo does **not** know which MCPs are installed in the user's Claude — only you do.

Cross-reference \`destinationExamples\` against the MCPs available in this session:

- **Example IS installed** → present as something the user can do now. Lead with the \`valueHook\`. Ask if they want to read the catalyst.
- **No example installed** → present as a soft suggestion, not a blocker. Lead with the \`valueHook\` and add: "you'd need a CRM MCP — HubSpot, Salesforce, Pipedrive, Attio — wired into Claude for this." Never gatekeep ("can't do this") — frame as an opt-in upgrade.
- **\`missingProtocols\` non-empty** → the bot's protocols don't currently support this catalyst. Mention it as a possibility unlocked by editing the bot, not by installing an MCP.

Lead with the user's outcome (\`valueHook\`), not the catalyst's name. The catalyst id is a handle to fetch the recipe with \`get_catalyst\`; it's not how you describe the value to the user.`;

export async function customCatalystHandler(_input, _ctx) {
  // Plain text content (not JSON-stringified) so the agent reads it as prose.
  return { content: [{ type: 'text', text: CUSTOM_CATALYST_GUIDE }] };
}

function enabledProtocolsOf(dep) {
  const map = dep.config?.enabledProtocols || {};
  return Object.entries(map)
    .filter(([, on]) => on)
    .map(([protocol]) => protocol);
}

function buildRecommendation(catalyst, applicableDeployments = []) {
  return {
    id: catalyst.id,
    name: catalyst.name,
    valueHook: catalyst.valueHook,
    summary: catalyst.summary,
    category: catalyst.category,
    destinationCategory: catalyst.requires?.destinationMcpCategory || null,
    destinationExamples: Array.isArray(catalyst.requires?.destinationExamples)
      ? catalyst.requires.destinationExamples
      : [],
    ...(applicableDeployments.length > 0 ? { applicableDeployments } : {}),
  };
}

async function recommendForOneBot(deploymentId) {
  const dep = await DeploymentRepository.findById(deploymentId);
  if (!dep) throw new Error(`Deployment not found: ${deploymentId}`);

  const enabledProtocols = enabledProtocolsOf(dep);
  const applicable = [];
  const requiresProtocolChange = [];

  for (const catalyst of getCatalystCatalog().values()) {
    const required = Array.isArray(catalyst.requires?.protocols)
      ? catalyst.requires.protocols
      : [];
    const missingProtocols = required.filter((p) => !enabledProtocols.includes(p));
    const rec = { ...buildRecommendation(catalyst), missingProtocols };
    if (missingProtocols.length === 0) applicable.push(rec);
    else requiresProtocolChange.push(rec);
  }

  return {
    consultationPosture: CONSULTATION_POSTURE,
    deployment: { id: dep.id, botName: dep.botName, enabledProtocols },
    applicable,
    requiresProtocolChange,
  };
}

async function recommendForFleet(deploymentIds) {
  let deployments = await DeploymentRepository.list();
  if (Array.isArray(deploymentIds) && deploymentIds.length > 0) {
    const wanted = new Set(deploymentIds);
    deployments = deployments.filter((d) => wanted.has(d.id));
  }
  if (deployments.length === 0) {
    throw new Error('No deployments matched fleet recommendation request');
  }

  // For each bot, compute the enabled-protocol set once.
  const botEnabled = deployments.map((d) => ({
    id: d.id,
    botName: d.botName,
    enabledProtocols: enabledProtocolsOf(d),
  }));

  const applicable = [];
  const requiresProtocolChange = [];

  for (const catalyst of getCatalystCatalog().values()) {
    const required = Array.isArray(catalyst.requires?.protocols)
      ? catalyst.requires.protocols
      : [];

    const fitting = botEnabled.filter((b) =>
      required.every((p) => b.enabledProtocols.includes(p)),
    );

    if (fitting.length > 0) {
      // crossBot: catalyst applies to ≥2 bots → the value-add of fleet mode.
      // A skill synthesized from this recommendation should iterate over
      // applicableDeployments rather than binding to a single bot.
      const rec = {
        ...buildRecommendation(
          catalyst,
          fitting.map((b) => ({ id: b.id, botName: b.botName })),
        ),
        crossBot: fitting.length > 1,
      };
      applicable.push(rec);
    } else {
      // No bot in the requested set has the required protocols. Surface a
      // per-bot missingProtocols hint anchored on the smallest gap so the
      // user can see what'd need to change.
      const gaps = botEnabled.map((b) => ({
        botId: b.id,
        botName: b.botName,
        missingProtocols: required.filter((p) => !b.enabledProtocols.includes(p)),
      }));
      gaps.sort((a, b) => a.missingProtocols.length - b.missingProtocols.length);
      requiresProtocolChange.push({
        ...buildRecommendation(catalyst),
        smallestGap: gaps[0],
      });
    }
  }

  // Sort fleet-applicable by breadth (most bots first) — catalysts that span
  // the fleet are the new category this surface enables.
  applicable.sort(
    (a, b) =>
      (b.applicableDeployments?.length || 0) - (a.applicableDeployments?.length || 0),
  );

  return {
    consultationPosture: CONSULTATION_POSTURE,
    fleet: {
      totalBots: deployments.length,
      bots: botEnabled,
    },
    applicable,
    requiresProtocolChange,
  };
}

export async function recommendCatalystsHandler(input, _ctx) {
  const { deploymentId, scope, deploymentIds } = input || {};

  if (deploymentId) {
    return recommendForOneBot(deploymentId);
  }

  if (scope === 'fleet' || Array.isArray(deploymentIds)) {
    return recommendForFleet(deploymentIds);
  }

  throw new Error(
    "deploymentId is required, OR pass { scope: 'fleet' } / { deploymentIds: [...] } for cross-bot recommendations",
  );
}

export function registerCatalystTools() {
  registerTool({
    name: 'list_catalysts',
    description:
      "List curated workflow recipes (\"catalysts\") shipped with mojulo. A catalyst is NOT a Claude Code skill and NOT a mojulo bot capability — it is a recipe you read to catalyze the synthesis of a Claude Code skill (.claude/skills/<name>/SKILL.md) that operates on a mojulo bot's data via this MCP plus a destination MCP installed in Claude Code. The name is intentionally bare (not \"skill catalyst\") to keep the concept distinct from the skill it produces: catalysts produce skills, they are not skills. Each catalyst is consumed once per synthesis to crystallize a structured skill out of user intent + bot shape + destination. Returns id, name, summary, category, and requirements per catalyst (notably requires.protocols, which names the mojulo bot capabilities the target bot must have enabled). Call get_catalyst to read the full recipe.",
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional filter (e.g., crm-sync, itsm, calendar, digest, analysis, rag-curation).',
        },
      },
    },
    handler: listCatalystsHandler,
  });

  registerTool({
    name: 'get_catalyst',
    description:
      "Get the full body of a catalyst by id. The returned body is a recipe written for you (Claude) to read at synthesis time — it tells you how to write a new Claude Code skill (.claude/skills/<name>/SKILL.md) that operates on a mojulo bot. The body starts with a synthesizer briefing that (a) explicitly licenses you to adapt, combine, or write from scratch when the catalyst doesn't fit, and (b) disambiguates three overlapping terms (mojulo protocols vs. Claude Code skills vs. catalysts). Read the briefing before the recipe.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Catalyst id from list_catalysts.' },
      },
      required: ['id'],
    },
    handler: getCatalystHandler,
  });

  registerTool({
    name: 'custom_catalyst',
    description:
      "Return an author's guide for drafting a new catalyst to contribute back to the mojulo library. Use this when the user says they want to write, propose, or contribute a new catalyst — NOT when they want to automate something for themselves (that's a local skill, synthesized from get_catalyst or directly from intent). The returned body is self-contained: posture-check rules with worked examples (so you push back on requests that aren't catalyst-shaped before drafting), batched context-gathering questions, the JSON frontmatter spec, the six-section body template, body principles, a by-hand validation checklist, and PR hand-off instructions. The guide tells you to anchor on existing exemplars via list_catalysts + get_catalyst before drafting — do that. The output of the workflow is a single .md file saved in the user's working directory, ready for them to PR to github.com/zombico/mojulo under control/lib/mcp/catalysts/.",
    inputSchema: { type: 'object', properties: {} },
    handler: customCatalystHandler,
  });

  registerTool({
    name: 'recommend_catalysts',
    description:
      "Recommend catalysts that fit either ONE deployment (single-bot mode) or every connected bot (fleet mode). Single-bot: pass `deploymentId`; returns catalysts annotated with `missingProtocols` per the bot's enabled capabilities. Fleet mode: pass `scope: 'fleet'` (every connected bot) or `deploymentIds: [...]` (an explicit subset). Each fleet recommendation is annotated with `applicableDeployments: [{ id, botName }]` so a synthesized skill can iterate across the matching bots, and `crossBot: true` whenever a catalyst applies to ≥2 bots — the new category fleet aggregation unlocks (e.g., 'weekly digest across every intake bot into one CRM'). Use this — not `list_catalysts` — whenever the user asks 'what can I do with this bot?' / 'what can I do across all my bots?' / 'what should I automate?'. CONSULTATION surface: catalysts whose `destinationExamples` aren't installed in the user's Claude should be surfaced as soft suggestions, never as blockers. The response includes a `consultationPosture` block with the exact framing rules — read it before composing your answer.",
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description:
            'Single-bot mode. Deployment id from list_deployments. Mutually exclusive with scope/deploymentIds.',
        },
        scope: {
          type: 'string',
          enum: ['fleet'],
          description: "Pass 'fleet' to recommend across every connected bot.",
        },
        deploymentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit deployment-id subset for fleet mode. Overrides scope: fleet.',
        },
      },
    },
    handler: recommendCatalystsHandler,
  });
}
