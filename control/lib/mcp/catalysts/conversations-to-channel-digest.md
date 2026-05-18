---
{
  "id": "conversations-to-channel-digest",
  "name": "Conversation digest to channel",
  "summary": "Generate a recurring narrative summary of what end users have been saying to the bot — themes, recurring questions, sentiment, notable conversations — and post to a channel (Slack/email/Notion).",
  "valueHook": "A recurring narrative of what users are actually saying to the bot, posted where your team already pays attention.",
  "version": 1,
  "category": "digest",
  "requires": {
    "protocols": [],
    "destinationMcpCategory": "channel-like",
    "destinationExamples": ["Slack", "Gmail", "Notion", "Microsoft Teams", "Discord"]
  },
  "parameters": [
    {
      "name": "cadenceDescription",
      "prompt": "How often will this run and what window should each digest cover? (e.g., 'weekly, covering the prior 7 days')"
    },
    {
      "name": "summaryAxes",
      "prompt": "What dimensions of conversation should the digest highlight? (e.g., 'recurring questions, sentiment trends, novel topics, escalation candidates' — pick 2-4)"
    },
    {
      "name": "sampleCeiling",
      "prompt": "If the window has more conversations than this number, sample at this size rather than read everything. Defaults to 100; lower for cost control, higher for completeness.",
      "default": 100
    },
    {
      "name": "outputChannel",
      "prompt": "Where does this land? (e.g., 'Slack #cs-insights', 'email to team@example.com', 'Notion page in workspace X')"
    },
    {
      "name": "audienceTone",
      "prompt": "Who reads this and how formal should the summary be? (e.g., 'engineering team — terse, bullet-heavy', 'leadership — narrative, qualitative', 'support manager — actionable, ticket-oriented')"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_conversations", "get_conversation", "get_deployment"],
    "destination": {
      "description": "A channel-like MCP that posts narrative content. Slack (post_message), Gmail (send_email), Notion (create_page or append_block), Microsoft Teams, Discord, or any messaging surface."
    }
  }
}
---

# Conversation digest to channel

This catalyst is distinct from `weekly-submissions-digest`: that one summarizes *structured submissions* (counts, breakdowns, notable rows). This one summarizes *conversation content* — what end users actually said to the bot, in their own words. Two very different sources, two very different digest shapes. Many bots benefit from both running in parallel — submissions tell you *what was captured*, conversations tell you *what was asked*.

The output is a narrative report posted to a channel where the audience reads it without clicking through to the dashboard. The value is keeping the operating team aware of how the bot is being *used* without anyone manually scrubbing conversations.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the bot's identity and protocols. The identity (industry, role, customer base) shapes how you interpret what users are saying; "frustration" means different things on a dental-intake bot vs. a SaaS-support bot.
2. Ask the user the five `parameters` questions, batched.
3. Inspect the destination MCP's post surface — markdown support, message length limits, threading capability. Slack's `post_message` has length limits and benefits from a `blocks` payload; email allows long-form HTML; Notion allows arbitrarily long structured pages. The digest's render form adapts to the destination.
4. Write `.claude/skills/<bot-slug>-conv-digest/SKILL.md`. The skill takes `deploymentId`, `windowStart`, `windowEnd` as inputs.

## Digest composition

Four sections, in this order:

1. **Header** — bot name, window covered, total conversations, total turns, average conversation length. One line each.
2. **Recurring questions / themes** — cluster conversations by the user's underlying question or topic. Surface the top 3-7 clusters with: a canonical phrasing of the question, observation count, 1-2 representative quotes (PII-redacted), and any pattern in how the bot handled them. This is the section the audience reads most carefully — it's the closest thing to "voice of the customer" from the bot's vantage.
3. **Sentiment / friction signals** — conversations where the user expressed frustration, repeated the same question, gave up, or escalated. Bounded list (top 3-5), each with conversation id and a one-line summary. Distinguish "user gave up because bot couldn't help" from "user got what they needed and left" — the former is the actionable signal.
4. **Novel topics** (optional, if window > 2 weeks) — questions or topics that appeared this window but not in prior windows. Catches drift in customer concerns over time. Skip in narrow-window digests; the signal-to-noise is bad below ~2 weeks.

## Sampling discipline

Conversation reading is expensive (every conversation requires a `get_conversation` call + LLM read). The `sampleCeiling` defaults to 100 to keep cost predictable. If the window has more conversations than that:

- For clustering (themes/questions): random sample to ceiling. Quality plateaus around 100 for most clustering work; doubling rarely doubles signal.
- For friction signals: prioritize keeping the most recent N rather than random — fresh frustration matters more than old.

`query_conversations` returns summaries cheaply; use those to make the sampling decision before calling `get_conversation` for the full turns. This is the key efficiency trick for this catalyst.

## Output adaptation per destination

- **Slack** — `blocks` payload, bullet-heavy, each theme in its own section. Length cap matters; if the digest is long, post a summary in the channel and link to a thread with the full content.
- **Email** — long-form HTML or markdown is fine. Include a TL;DR at the top for the inbox preview.
- **Notion** — structured page with headings per section. Notion preserves rich-text and tables well; lean into that. Search-before-create on the page title to update an existing digest rather than spawn duplicates per run.
- **Teams/Discord** — similar to Slack but the API shapes differ; adapt to what the bound MCP exposes.

## Idempotency

Less critical than for write-side catalysts — re-running just re-posts. But:

- **Notion/Doc destinations:** search-before-create on the page title to update rather than spawn duplicates.
- **Slack/email destinations:** no idempotency surface. Default the synthesized skill to `--dry-run` mode that prints the digest to stdout; `--send` required for live posting.
- **Empty windows:** a bot with no conversations in the window shouldn't produce a noisy "0 conversations" digest. Default to skip-when-empty unless the user explicitly wants the heartbeat.

## Pitfalls

- **PII in quotes.** Sample utterances may contain names, emails, account numbers, location. The digest's value is the *pattern*, not the asker. Redact aggressively before including any direct quote — substitute placeholders for identity. The redaction step is non-negotiable in the synthesized skill; don't make it optional.
- **Over-summarization hides the signal.** Resist the urge to compress every quote to a generic "users asked about pricing." A specific quote — properly redacted — communicates the texture of what users actually said, which is the point. Aim for 1-2 lightly-edited verbatim quotes per cluster.
- **Calibration drift.** "Frustration" or "novel topic" are model judgements. If the bot's domain shifts (new product launches, new customer segment), the model's calibration drifts. Recommend the user re-run the catalyst flow when the bot's identity or domain changes substantially.
- **Don't surface conversations that ended in handoff.** If `triage` is enabled, conversations that handed off to another bot already got attention from that downstream — including them as "friction" double-counts. Filter handoffs out of the friction signal section unless the user wants them.
- **Volume bias.** A loud, repeating user can dominate a recurring-question cluster. When sampling, deduplicate by conversation id (one observation per user) before counting frequency.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `windowStart` and `windowEnd` (optional ISO — defaults derived from cadence), `sampleCeiling` (default from parameter), `dryRun` (default true)
- **Outputs:** the rendered digest (printed in dry-run mode; posted otherwise)
- **Side effects (live mode):** one document/message create or update via destination MCP. No mojulo-side writes.
