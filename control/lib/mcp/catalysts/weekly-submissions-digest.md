---
{
  "id": "weekly-submissions-digest",
  "name": "Periodic submissions digest",
  "summary": "Produce a recurring digest of recent bot submissions (counts, trends, notable items) and post it to a doc, channel, or email.",
  "valueHook": "A recurring summary of recent submissions — counts, trends, notable items — posted where stakeholders see it.",
  "version": 1,
  "category": "digest",
  "requires": {
    "protocols": ["formGathering"],
    "destinationMcpCategory": "doc-or-channel-like",
    "destinationExamples": ["Notion", "Slack", "Gmail", "Google Docs"]
  },
  "parameters": [
    {
      "name": "cadenceDescription",
      "prompt": "How often will this run, and what window should each digest cover? (e.g., 'weekly, covering the prior 7 days')"
    },
    {
      "name": "groupBy",
      "prompt": "What dimensions should the digest break submissions down by? (e.g., 'source channel, lead type, urgency tag' — pick fields from the bot's form schema)"
    },
    {
      "name": "notableThreshold",
      "prompt": "What qualifies as a 'notable' submission worth calling out individually in the digest? (e.g., 'high-priority complaints, deals > $10k, returning customer issues')"
    },
    {
      "name": "outputFormat",
      "prompt": "Where does this land, and what format? (e.g., 'Notion page in workspace X', 'Slack message to #bot-digest', 'email to team@example.com')"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_deployment"],
    "destination": {
      "description": "Any MCP that can write a document or post a message. Examples: Notion (create_page), Slack (post_message), Gmail (send_email), Google Docs (create_document)."
    }
  }
}
---

# Periodic submissions digest

A digest skill is a low-cost way for a team to stay aware of what a bot is collecting without anyone manually clicking through the dashboard. The synthesis goal is a skill that, run on a cadence (manually or via scheduler), summarizes the recent submission window into the user's chosen output surface.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the form schema. The fields listed in `groupBy` must exist; if not, ask the user to pick others.
2. Ask the user the four `parameters` questions in one round.
3. Inspect the destination MCP's write surface — markdown support, length limits, attachment support. The digest format adapts to what the destination accepts.
4. Write `.claude/skills/<bot-slug>-digest/SKILL.md`.

## Digest composition

A good digest has four sections, in this order:

1. **Header:** bot name, window covered, total submissions.
2. **Counts:** breakdown by each `groupBy` dimension. Tables or bullet lists depending on destination capability.
3. **Trends:** week-over-week deltas if a prior digest exists. The synthesized skill should optionally read the prior digest from the destination to compute deltas; if the destination doesn't support read, skip trends.
4. **Notable items:** 3-10 submissions matching `notableThreshold`, each with a one-line summary and a link/id back to the source. Keep this section bounded — the digest loses value when it tries to surface everything.

## Sampling vs full scan

For low-volume bots (<200 submissions/window) the skill processes every submission. For higher volume, the skill samples notable items and counts via lightweight aggregation rather than LLM-classifying every row. Set the threshold at synthesis time based on the bot's observed volume — `query_submissions` with a recent window tells you roughly what to expect.

## Idempotency

Less critical here than for write-side catalysts — re-running the digest just overwrites or re-posts. But:

- For Notion/Doc destinations: search-before-create on the page title to update an existing digest rather than spawn duplicates per run.
- For Slack/email destinations: there's no idempotency — re-running re-sends. Default the synthesized skill to `--dry-run` mode that prints the digest to stdout, with `--send` required for live.

## Pitfalls

- **Stale notable threshold.** The threshold "high-priority complaints" depends on the form having a `priority` or equivalent field. If the form changes, the digest silently goes empty. Recommend the user re-run the catalyst flow when form fields they reference change.
- **PII in digests.** Digests are often shared more broadly than the form submission was. Default to summarizing identity (count + role + general region) rather than dumping names/emails into the digest body. The user can override if their team needs identity.
- **Empty windows.** A bot with no submissions in the window shouldn't produce a noisy "0 submissions" digest every week. Default the synthesized skill to skip-when-empty unless the user explicitly wants the heartbeat.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `windowStart` and `windowEnd` (optional ISO — defaults derived from cadence), `dryRun` (default true)
- **Outputs:** the rendered digest (printed in dry-run mode, posted otherwise)
- **Side effects (live mode):** one document/message create or update via destination MCP.
