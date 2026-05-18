---
{
  "id": "submission-to-ticket",
  "name": "Submission to ITSM ticket",
  "summary": "Turn new submissions (or triaged conversations) into tickets in Linear/Jira/ServiceNow with routing, priority, and assignment.",
  "valueHook": "Bot intake becomes routed, prioritized tickets in your team's tracker — no manual triage step.",
  "version": 1,
  "category": "itsm",
  "requires": {
    "protocols": ["formGathering"],
    "optionalProtocols": ["triage"],
    "destinationMcpCategory": "ticketing-like",
    "destinationExamples": ["Linear", "Jira", "ServiceNow", "GitHub Issues"]
  },
  "parameters": [
    {
      "name": "routingRules",
      "prompt": "How should submissions route to teams/projects/assignment groups? (e.g., 'urgent complaints → on-call coordinator; billing issues → finance queue; general → support backlog')"
    },
    {
      "name": "priorityRules",
      "prompt": "What signals priority? (e.g., 'words like emergency/urgent → high; missed-appointment forms → high; everything else → normal')"
    },
    {
      "name": "titleTemplate",
      "prompt": "How should the ticket title be composed? (e.g., '[chief_complaint] — [name] ([conversation_id])')"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_conversation", "get_deployment"],
    "destination": {
      "description": "A ticketing-like MCP exposing issue/ticket create with title, body, priority, project/queue, and assignee fields. Examples: Linear, Jira, ServiceNow, GitHub Issues."
    }
  }
}
---

# Submission to ITSM ticket

This catalyst wires a mojulo bot's submissions (and, when the `triage` protocol is enabled, the routing decision) into a ticketing system. Each submission becomes one ticket with derived priority, project/queue assignment, and a description rich enough that the assignee doesn't need to come back and read the original conversation.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the form schema. If the bot has `triage` enabled, note the routes; they're hints for `routingRules`.
2. Ask the user the three `parameters` questions.
3. Inspect the destination MCP to learn its ticket-create surface — particularly the **project/queue identifier shape** (Linear team id, Jira project key, ServiceNow assignment group sys_id) and the **priority enum** (Linear: 1-4, Jira: P0-P5, ServiceNow: 1-5).
4. Write `.claude/skills/<bot-slug>-ticket-sync/SKILL.md`.

## Routing logic

Apply `routingRules` as a single classification step per submission. The skill picks one project/queue per submission. If the rules don't match cleanly, default to a configured fallback queue rather than guessing — silent misrouting is worse than a clear "unsorted" pile a human can clear.

When the bot has `triage` enabled, **prefer the bot's own triage decision over re-classifying**. The triage protocol has already routed the conversation against the vector store; re-doing that work risks divergence. Use the triage label as the queue assignment; only apply `routingRules` for priority and any secondary routing axis.

## Priority logic

Same shape: one LLM judgement per submission, returns a priority + one-sentence reason. The reason goes into the ticket body so reviewers see why something was tagged P0 vs P3.

## Ticket body composition

The synthesized skill should build the body from:

1. **Submission fields** rendered as a clean key/value list (use the form schema field labels, not raw keys).
2. **Conversation excerpt** — pull the conversation via `get_conversation(deploymentId, conversationId)` and include the last 4-6 turns. Don't dump the whole thing; reviewers will skim.
3. **Mojulo trace** — submission id, conversation id, deployment id, captured-at timestamp. Critical for incident response — the reviewer needs to be able to walk back to the source.
4. **Verification link** — if the conversation has a `chain_hash`, include the bot's `/verify/<conversationId>` URL so the reviewer can confirm tamper-evidence on dispute.

## Idempotency

`since` cursor + a `mojulo_submission_id` field on the ticket (most ticketing systems support custom fields or labels). Search-before-create to avoid double-filing on re-runs. If the system has no custom-field surface, append the submission id to the ticket title as `[sub:...]` and grep on retry.

## Pitfalls

- **Triage-vs-rules conflict.** If both the bot's triage and the skill's `routingRules` apply, the user needs to know which wins. Default to triage. Make the synthesized skill comment this clearly.
- **PII in ticket bodies.** Tickets are often visible to wider teams than the form submission was intended for. If the bot collects SSN/DOB/financial info, ask the user during synthesis whether to redact those fields from the ticket body (store identifiers only) and link to the bot's submission view for the full record.
- **Alert fatigue.** A new bot may have a backlog of historical submissions. The first run with a wide `since` window can flood a queue. Recommend the user start with a narrow window or pipe the first batch into a triage project for review.
- **Closing the loop.** This skill creates tickets; it doesn't close them. Ticket lifecycle stays in the ITSM. If the user later wants the bot to know "this issue was resolved," that's a separate skill in the other direction (and not currently exposed).

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `since` (optional ISO), `dryRun` (default true), `fallbackQueue` (required for live mode — the queue used when routing fails)
- **Outputs:** per-submission decision log `{ submissionId, priority, queue, ticketId? }`
- **Side effects (live mode only):** ticket create via destination MCP. No mojulo-side writes.
