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

import { getCatalyst, listCatalysts } from '@/lib/mcp/catalysts/loader';
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
}
