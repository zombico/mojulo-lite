---
{
  "id": "scan-conversations-for-signal",
  "name": "Scan conversations for a signal",
  "summary": "Sample recent bot conversations, scan each for a user-defined signal (churn intent, competitor mentions, recurring complaints), and route matches to an actuator MCP.",
  "valueHook": "Sample recent conversations for a signal you care about — churn intent, competitor mentions, recurring complaints — and route matches where the team can act.",
  "version": 1,
  "category": "analysis",
  "requires": {
    "protocols": [],
    "destinationMcpCategory": "actuator-like",
    "destinationExamples": ["Linear", "Slack", "Notion", "Google Sheets"]
  },
  "parameters": [
    {
      "name": "signalDefinition",
      "prompt": "What signal are you scanning for? (e.g., 'mentions of competitor X', 'churn intent or cancellation language', 'accessibility complaints', 'recurring feature requests')"
    },
    {
      "name": "sampleSize",
      "prompt": "How many recent conversations to scan per run?",
      "default": 30
    },
    {
      "name": "matchAction",
      "prompt": "What should happen when the signal fires? (e.g., 'file a Linear ticket tagged voice-of-customer', 'post a Slack message to #cs-insights', 'append a row to a Notion database')"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_conversations", "get_conversation", "get_deployment"],
    "destination": {
      "description": "Any MCP that can perform the configured matchAction. Examples: Linear (issue_create), Slack (post_message), Notion (append_block), Sheets (append_row)."
    }
  }
}
---

# Scan conversations for a signal

This is the analytical counterpart to the write-side catalysts. Rather than acting on every submission, it samples conversations, looks for a specific signal in the turn text, and only acts when the signal fires. The point is **sampling, not sweeping** — a bounded scan lets the user tune their signal prompt against real conversations before scaling up.

This catalyst formalizes a recipe already documented in [docs/mcp-integration.md](docs/mcp-integration.md#recipes) §4 — the formal version adds parameterization and a behavior contract.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the bot's protocols and identity. The signal prompt benefits from knowing what the bot is *for*; "churn intent" means different things on a support bot vs. a sales bot.
2. Ask the user the three `parameters` questions.
3. Inspect the destination MCP for the actuator surface implied by `matchAction`. The mapping from signal-match to action payload is the catalyst's value-add.
4. Write `.claude/skills/<bot-slug>-scan-<signal-slug>/SKILL.md`. Naming includes the signal so multiple signal scans on the same bot don't collide.

## Scan logic

1. `query_conversations(deploymentId, since?)` to get summaries — already sorted by recency.
2. Take the top `sampleSize`. For each, `get_conversation(deploymentId, conversationId)` to pull the turn list.
3. Run a single LLM judgement per conversation against `signalDefinition`. Return: `{ matched: bool, evidence: '<quoted snippet, ≤200 chars>', confidence: 'low' | 'medium' | 'high' }`.
4. For matches, fire `matchAction` with a payload that includes the conversation id, the evidence snippet, and a link/path back to the source.

## Action payload composition

The synthesized skill should produce one action per match (not one batched action per run). The payload structure:

- A title or summary derived from `signalDefinition` and the matched conversation
- The evidence snippet **with surrounding context** (1 turn before, 1 turn after) — quoting in isolation loses meaning
- Conversation id + deployment id + bot name (mojulo trace)
- The chain verification URL `<bot-url>/verify/<conversationId>` so the reviewer can confirm authenticity

## Sampling discipline

`sampleSize` defaults to 30 for a reason — it keeps each run's LLM cost predictable and bounded. The user can scale up once they've validated the signal definition holds up. Recommend the synthesized skill default to a small sample for the first few runs, then graduate.

For continuous monitoring, the right pattern is to combine this skill with `/schedule` so it runs on a cadence. Avoid trying to do "watch all conversations always" — there's no event surface for that, and the polling cost would be silly.

## Multiple signals on one bot

Don't synthesize a multi-signal skill. Each signal gets its own skill instance. Reasons:

- The signal prompt is the brittle part — tuning one signal shouldn't risk regressing another.
- Sampling overlap is fine: two skills both scanning the recent 30 cost roughly twice as much, which is fine.
- Action targets often differ per signal (churn → CS Slack; competitor → product Notion; feature request → product backlog).

## Pitfalls

- **False positives flood the actuator.** A loose signal definition fires on too many conversations and floods the destination. The first run with a new signal should default to `--dry-run` so the user sees what would have fired before they wire it live.
- **Confidence calibration.** "High confidence" from the model doesn't mean the signal is real — it means the model is sure of its own judgement. Recommend the user spot-check 10-20 matches early on to calibrate.
- **PII through the LLM.** Conversation turns can contain sensitive content. Scanning by definition reads them. Same caveat as the other catalysts — confirm against the bot's data-handling posture.
- **Stale conversations.** `query_conversations` is unbounded by default. With no `since`, the sample drifts toward the oldest conversations. Always pass `since` (default: 7d).

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `sampleSize` (default 30), `since` (default 7d ago, ISO), `dryRun` (default true)
- **Outputs:** per-conversation scan log `{ conversationId, matched, confidence, evidence?, actionResult? }`
- **Side effects (live mode):** one destination-MCP action per match.
