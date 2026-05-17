---
{
  "id": "knowledge-gap-miner",
  "name": "Knowledge gap miner",
  "summary": "Analyze recent conversations on a knowledge-protocol bot to find questions the RAG corpus answered poorly, and propose additions to the user's documentation backlog.",
  "version": 1,
  "category": "rag-curation",
  "requires": {
    "protocols": ["knowledge"],
    "destinationMcpCategory": "optional-doc-backlog"
  },
  "parameters": [
    {
      "name": "lookbackWindow",
      "prompt": "How far back should this scan? (e.g., '7 days', '30 days')",
      "default": "14 days"
    },
    {
      "name": "minOccurrences",
      "prompt": "How many times must a gap be observed before it's worth surfacing?",
      "default": 2
    },
    {
      "name": "backlogDestination",
      "prompt": "Where should proposed doc additions go? (e.g., 'a Notion page', 'a Linear ticket per gap', 'just print to stdout' — leave empty for stdout-only)"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_conversations", "get_conversation", "get_deployment"],
    "destination": {
      "description": "Optional. If specified, a doc/backlog MCP that can accept proposed additions. Examples: Notion (create_page), Linear (issue_create), GitHub (create_issue)."
    }
  }
}
---

# Knowledge gap miner

A `knowledge`-protocol bot answers from its RAG corpus. When it doesn't have a good answer — vague reply, hedged response, "I don't have information about that" — that's a signal the corpus is missing something users actually ask about. This catalyst mines those signals and turns them into a deduplicated, prioritized backlog of doc additions.

Unlike the other catalysts, the destination is **optional**. The most useful output is often just the printed list — a focused weekly review by whoever owns the corpus. A backlog MCP is a nice-to-have.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — confirm the `knowledge` protocol is active. Read the bot's domain identity; it shapes how you interpret "gap."
2. Ask the user the three `parameters` questions.
3. If `backlogDestination` was given, inspect that MCP's create surface.
4. Write `.claude/skills/<bot-slug>-gap-miner/SKILL.md`.

## Detection logic

Walk recent conversations (`query_conversations` with `since` derived from `lookbackWindow`, then `get_conversation` per id). For each conversation, scan the bot's turns for **weak-answer signals**:

- Explicit declines: "I don't have information about that," "I can't find that in my knowledge base," "you'd need to contact support for that"
- Hedging: "based on what I can tell," "I'm not entirely sure," "you may want to verify"
- Topic-deflection: bot answers a *related* question rather than the one asked
- User dissatisfaction cues: user re-phrases the same question, user says "that's not what I asked," user abandons the conversation after a vague answer

For each weak-answer turn, extract the **user's underlying question** as a short canonical phrasing (not a quote — a generalization). This is the gap.

## Clustering and dedup

Cluster gaps by semantic similarity across the window. One user asking "what are your hours" three times is one gap, three observations. Three different users asking variations of "how do I cancel" is one gap, three observations.

Surface only clusters with ≥ `minOccurrences` observations. This filters one-off questions from genuine corpus gaps.

## Proposal composition

For each surfaced gap, generate:

- **Canonical question** — the gap as a documentable Q
- **Observation count** — how many conversations hit this
- **Sample utterances** — 2-3 actual phrasings from real conversations (with conversation ids for traceability)
- **Proposed addition** — a short paragraph the user could paste into their docs as a starting point. Mark this clearly as **proposed, not authoritative** — the user must review before adding to the corpus.

The user re-uploads accepted additions through the normal mojulo document-upload flow ([upload_document_from_url](docs/mcp-integration.md) tool) — this skill does **not** modify the bot's corpus directly.

## Output

- **Always:** a markdown report printed to stdout (or, in Claude Code, returned as the skill's result text). The user reads it.
- **If `backlogDestination` is configured:** one entry per surfaced gap in the destination. For Linear: one issue per gap. For Notion: one page (or one row in a database). Each entry includes the conversation ids so the reviewer can drill back.

## Pitfalls

- **Weak-answer false positives.** A bot that's been told to hedge ("I'm an AI, please verify with...") will look like it has gaps everywhere. Calibrate by reading the bot's identity prompt — if hedging is configured behavior, raise the bar for what counts as weak.
- **PII in the report.** Sample utterances may contain identity. Redact aggressively — the report's value is the *question pattern*, not the asker. Replace names/emails/specific identifiers with placeholders before including.
- **Don't auto-add to corpus.** The corpus is the bot's behavior. Silent additions are surprise behavior changes. Always go through the user — propose, never inject.
- **Cadence.** Once-a-week or once-a-month is plenty. Running this daily produces noise and the corpus doesn't change that fast.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `lookbackWindow` (default 14d), `minOccurrences` (default 2), `dryRun` (default true)
- **Outputs:** the gap report (always), per-gap destination action results (when configured)
- **Side effects (live mode, only if destination configured):** one entry per gap in the destination. **Never writes to the bot's corpus** — that path is user-mediated through document upload.
