---
{
  "id": "submissions-to-warehouse",
  "name": "Submissions to data warehouse",
  "summary": "Append form submissions to an analytical warehouse table (BigQuery/Snowflake/Postgres/Redshift) with stable schema and incremental cursor — append-only, no qualifying logic, ready for SQL analysis downstream.",
  "version": 1,
  "category": "warehouse",
  "requires": {
    "protocols": ["formGathering"],
    "destinationMcpCategory": "warehouse-like"
  },
  "parameters": [
    {
      "name": "targetTable",
      "prompt": "Fully-qualified target table name (e.g., 'analytics.mojulo_submissions', 'PROD.RAW.BOT_INTAKES'). Will be created if absent and the destination MCP supports DDL; otherwise the user creates it from the schema you propose."
    },
    {
      "name": "columnMapping",
      "prompt": "How should form fields map to warehouse columns? Provide field-name → column-name pairs plus the SQL type each column should use (STRING, TIMESTAMP, NUMERIC, BOOLEAN, JSON). For fields that aren't a clean fit, propose a JSON column and pack them there."
    },
    {
      "name": "partitionStrategy",
      "prompt": "How should the table be partitioned for query performance? (e.g., 'daily by captured_at', 'by deployment_id', 'none — small volume'). Defaults to daily if the warehouse supports time-partitioned tables.",
      "default": "daily by captured_at"
    },
    {
      "name": "backfillOnFirstRun",
      "prompt": "On the first run, should the skill backfill all historical submissions, or start from now-forward only? Backfill is fine for low-volume bots; bounded windows are safer for high-volume.",
      "default": "now-forward only"
    }
  ],
  "mcpTools": {
    "mojulo": ["query_submissions", "get_deployment"],
    "destination": {
      "description": "A warehouse-like MCP that exposes table create (optional) and row append/insert with named columns and types. Examples: BigQuery, Snowflake, Postgres, Redshift, DuckDB. The destination must support either bulk insert (preferred) or single-row insert. Streaming inserts are nice-to-have."
    }
  }
}
---

# Submissions to data warehouse

This is the analytical-pipeline counterpart to `qualify-lead-to-crm`. Where that catalyst is **opinionated** (scoring, branching, dedupe-as-update), this one is **mechanical** (append-only, schema-of-record, no qualifying judgments). The output is a warehouse table that downstream analysts can SQL against without knowing anything about mojulo's internals.

If you find yourself wanting "qualify the row before inserting" or "update an existing record on second submission" — that's the `qualify-lead-to-crm` catalyst, not this one. This catalyst's value is exactly its lack of opinions; every submission goes through, with the same shape, every time.

## How to synthesize the skill

1. `get_deployment(deploymentId)` — read the form schema. The schema **is** the source-of-truth for `columnMapping`. Never invent columns the bot's form doesn't produce; never silently drop form fields without surfacing them as candidates for a JSON column.
2. Ask the user the four `parameters` questions, batched. Propose a default `columnMapping` derived from the form schema (best-guess types per field name) and let the user adjust — don't make them type the whole mapping from scratch.
3. Inspect the destination MCP. Confirm it supports the insert path you need (bulk preferred, single-row acceptable). If the user's warehouse MCP only exposes query/read (no write), this catalyst doesn't apply — say so plainly rather than trying to force a path.
4. Write `.claude/skills/<bot-slug>-warehouse-sync/SKILL.md`. The skill takes `deploymentId` and `since` as inputs.

## Schema design

Every row in the target table has the same shape, regardless of which form was submitted. The columns:

- **Universal trace columns** — `submission_id` (PRIMARY KEY), `deployment_id`, `conversation_id`, `captured_at` (TIMESTAMP), `ingested_at` (TIMESTAMP — when this skill ran). These are non-negotiable. They're what makes the warehouse rows joinable to other systems and analyzable over time.
- **Mapped form columns** — one column per form field, per `columnMapping`. Types chosen to match analytical use (TIMESTAMP for dates, NUMERIC for currency, STRING for free text, BOOLEAN for yes/no, JSON for nested).
- **Fallback `raw_extras` JSON column** — any form field the user didn't explicitly map lands here. Better to capture-and-defer than to drop. Analysts can JSON-extract later if a field turns out to matter.
- **Optional partition column** — typically `captured_at` derived to a date for daily partition pruning. Some warehouses (BigQuery) have explicit partition syntax; others (Snowflake) use clustering keys.

The schema should be **additive-friendly** — when the bot's form grows new fields, the synthesized skill should detect the unmapped field, route it to `raw_extras`, and emit a clear log line. The user can later promote it to a typed column with an ALTER + a one-time backfill from `raw_extras`. Don't try to auto-ALTER the schema from the skill; warehouse DDL is operator territory.

## Incremental cursor

`since` cursor on `captured_at` is the primary mechanism. Each run:

1. Read the table's `MAX(captured_at)` (or accept `since` as input override).
2. `query_submissions(deploymentId, since=...)` to pull only newer rows.
3. Bulk-insert the batch.
4. Print the new high-water timestamp so the user can pass it back or wire it to a scheduler.

The synthesized skill should NOT rely on `submission_id` for incremental cursoring — IDs aren't guaranteed monotonic over time in the bot's SQLite. Always use timestamp.

## Idempotency

Two layers of defense, both important:

- **Cursor-based dedup (primary):** the `since` cursor advances past already-loaded rows. Re-running with the same `since` is a no-op when no new submissions exist.
- **`submission_id` PRIMARY KEY (safety net):** because cursor logic can fail (operator manually re-runs an old window, clock skew), the destination table's primary key on `submission_id` ensures double-inserts fail loudly rather than silently duplicate. Use `INSERT ... ON CONFLICT DO NOTHING` (Postgres) / `MERGE ... WHEN NOT MATCHED` (BigQuery/Snowflake) so re-runs degrade to no-ops instead of errors.

## Bulk vs. streaming

Default to **bulk inserts** (one statement per run, all rows in one batch). Reasons: cheaper per-row, atomic from the warehouse's perspective, easier to reason about for incremental loads. Streaming inserts are tempting for "near-real-time" but introduce per-row cost and break the idempotency story when retries land.

If the user's volume is high enough to need streaming (>~1000 submissions/hour sustained), this catalyst isn't the right tool — the bot's webhook ([server.js](../../lite-template/server.js)'s `/api/send-webhook`) is the architecturally-correct path for event-driven warehouse loading, and the skill becomes "drain the webhook DLQ" rather than "scan the bot's SQLite." Surface this distinction to the user if their submission rate is in that range.

## Pitfalls

- **PII in the warehouse.** Warehouses are typically more broadly accessible than the bot's SQLite — analysts, BI tools, downstream pipelines, sometimes vendors. If the form captures sensitive fields (DOB, SSN, financial, medical), the synthesized skill should default to **excluding** those columns from the mapping and pointing the user at column-level encryption or a separate restricted-access table. The user can override, but the question must be asked explicitly during synthesis.
- **Schema drift.** When the bot's form gains/renames/drops fields, the warehouse columns silently misalign. The skill must detect unmapped fields each run and emit a log line; recommend the user re-run the catalyst flow when they change the form.
- **Type coercion silently lies.** If a form field is "free text" but most rows look numeric, the user might map it to NUMERIC. The day a row arrives with `'N/A'` in that field, the insert fails or the value goes NULL. Default to STRING for any free-text field and let the user explicitly promote to a typed column only when they're certain of the data.
- **Backfill stampedes.** A `backfillOnFirstRun=true` against a bot with months of submissions will hammer both the bot proxy and the destination warehouse. Recommend chunking the backfill into 7-day windows with a delay between, and surface progress (`backfilled 2026-01-01..2026-01-07: 312 rows`).
- **Bot-proxy load.** `query_submissions` proxies through to the bot. For very large windows, the proxy can timeout or the bot can be slow to serialize. Recommend keeping per-run windows bounded (≤30 days) and chaining if a larger backfill is needed.

## Skill behavior contract

- **Inputs:** `deploymentId` (required), `since` (optional ISO — defaults to MAX(captured_at) from the destination table, falling back to 24h ago on first run), `dryRun` (default true)
- **Outputs:** per-run summary: `{ deploymentId, windowStart, windowEnd, rowsInserted, rowsSkippedDuplicate, unmappedFields: [...], newHighWaterMark }`
- **Side effects (live mode):** bulk insert / merge to the destination warehouse table. No mojulo-side writes. No bot-side writes.
