---
{
  "id": "qualify-lead-to-crm",
  "name": "Qualify lead and sync to CRM",
  "summary": "Score new submissions against the user's rubric and create matching CRM records, skipping low-quality leads.",
  "version": 1,
  "category": "crm-sync",
  "requires": {
    "protocols": ["formGathering"],
    "destinationMcpCategory": "crm-like"
  },
  "parameters": [
    {
      "name": "qualifyingCriteria",
      "prompt": "What makes a 'qualified' submission for your business? (rubric in plain English — e.g., specific industries, geographic area, deal size signals, accepted insurance carriers)"
    },
    {
      "name": "scoreThreshold",
      "prompt": "Minimum qualifying score (0-100) below which a submission is skipped?",
      "default": 60
    },
    {
      "name": "dedupeKey",
      "prompt": "Which submission field detects duplicate contacts in the CRM? (typically email or phone)"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_deployment"],
    "destination": {
      "description": "A CRM-like MCP exposing search-by-property + contact/deal create. Examples: HubSpot, Salesforce, Pipedrive, Attio."
    }
  }
}
---

# Qualify lead and sync to CRM

This catalyst turns a `formGathering` mojulo bot into a CRM intake pipeline. You score each new submission against the user's rubric, dedupe against existing CRM records, and create a contact (and optionally a deal) for the qualified ones.

## How to synthesize the skill

1. Call `get_deployment(deploymentId)` to read the bot's form schema. The synthesized skill's mapping is **derived from this schema** — never guess field names.
2. Ask the user the three `parameters` questions in one round.
3. Inspect the bound destination MCP to learn its contact-create surface (field names, required props, search-by-property tool). Field mapping is the catalyst's value-add — don't assume it's `name`/`email`/`phone` everywhere; HubSpot uses `firstname`/`lastname`/`email`, Salesforce uses `FirstName`/`LastName`/`Email`, Attio uses object/attribute pairs.
4. Write `.claude/skills/<bot-slug>-crm-sync/SKILL.md` with the synthesized workflow. The skill takes `deploymentId` and `since` as inputs.

## Mapping intent

The mojulo submission JSON has one entry per form field. Map by **field semantics**, not by position:

- Identity fields (email, phone, name) → CRM contact identity props. Use the configured `dedupeKey` to search-before-create.
- Categorical fields (industry, plan interest, source) → CRM contact properties or pipeline/stage tags on the created deal.
- Free-text fields (chief complaint, message, notes) → CRM contact `notes` or a follow-up activity log entry. Do **not** create a deal from free-text alone — these are the noisiest fields.
- Timestamp + submission id → store as `mojulo_submission_id` + `mojulo_captured_at` on the contact for traceability.

When the bot's form schema has a field that doesn't fit any CRM property, **ask the user** during synthesis where it should go. Don't silently drop fields.

## Qualifying logic

Run each submission through a single LLM judgement against `qualifyingCriteria`. Return a score 0-100 and a one-sentence reason. The skill stores the score + reason on the CRM contact (a `mojulo_qualifying_score` property) so the user can audit why something was kept or skipped without re-running the classifier.

Submissions below `scoreThreshold` are logged but not pushed. The skill emits a decision log per run.

## Idempotency

Use `since` as a high-water cursor on the submission timestamp. Each run pulls only submissions newer than `since`. The synthesized skill should print the new cursor at end of run so the user can pass it back next time — or wire it through a scheduler.

Independent of the cursor, **always search-before-create** on the `dedupeKey`. Two failure modes the cursor doesn't cover: a user re-runs an old window, or the same person submits twice. Search-before-create is the durable defense.

## Pitfalls — surface these to the user

- **PII back through the LLM.** Form-gathering's design point is that PII bypasses the LLM at capture time. This skill deliberately reintroduces PII at routing time, since qualifying needs to read fields like email or chief complaint. Worth confirming the user is OK with this against the data-handling posture they advertised to end users.
- **Irreversible writes.** CRM contact creates are visible to sales reps and trigger downstream automations (welcome sequences, lead-rotation rules). Default the synthesized skill to a `--dry-run` mode that prints decisions without writing. The user explicitly opts into live writes per run.
- **Rate limits.** CRMs throttle aggressively. Process submissions serially with a small inter-call delay rather than parallelizing.
- **Field-mapping drift.** If the user later edits the bot's form schema, the skill's mapping goes stale silently. Recommend the user re-run the catalyst flow to regenerate the skill when they change the form.

## Skill behavior contract

- **Inputs:** `deploymentId` (string, required), `since` (ISO timestamp, optional — defaults to last-cursor or 24h ago), `dryRun` (bool, default true)
- **Outputs:** a per-submission decision log: `{ submissionId, score, reason, action: 'created' | 'updated' | 'skipped-low-score' | 'skipped-duplicate', crmRecordId? }`
- **Side effects (live mode only):** CRM contact create/update via the bound MCP. No mojulo-side writes.
