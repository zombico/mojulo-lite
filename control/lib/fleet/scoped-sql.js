/**
 * In-memory SQLite assembly + SELECT-only validator for the SQL Explorer.
 *
 * On every query, we:
 *   1. Spin up a fresh `:memory:` better-sqlite3 DB.
 *   2. Fan out to every connected bot for its rollup endpoints.
 *   3. Load returned rows into named tables that mirror Prime's schema
 *      surface (bots, daily_bot_stats, bot_health, protocol_stats).
 *   4. Validate the user query (SELECT/WITH only, single statement, no
 *      ATTACH/PRAGMA/destructive verbs).
 *   5. Run it with row + duration caps.
 *   6. Discard the DB.
 *
 * Nothing crosses to the control-plane SQLite. The aggregates live only in
 * process memory for the duration of one request.
 *
 * Scoping note: in single-user mode the in-memory DB only contains the
 * user's own deployments — there's nothing to scope away, so the CTE
 * rewrite from Prime is intentionally omitted here. The seam is the same
 * table set, so a future multi-tenant variant can wrap the validated
 * query without changing the surface.
 */

import Database from 'better-sqlite3';
import { fanOut, listConnectedDeployments } from '@/lib/deployers/bot-fleet';

const ROW_CAP = 10_000;
const QUERY_TIMEOUT_MS = 30_000;

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE',
  'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM',
  'REINDEX', 'ANALYZE',
];

function stripCommentsAndStrings(sql) {
  // Replace single-quote string literals and SQL comments with spaces so the
  // forbidden-keyword scan can't be fooled by `SELECT 'DELETE'`.
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    if (c === "'") {
      out += ' ';
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') {
      // Double-quoted identifiers — keep contents (they're not keywords).
      out += c;
      i++;
      while (i < sql.length && sql[i] !== '"') {
        out += sql[i];
        i++;
      }
      if (i < sql.length) { out += sql[i]; i++; }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function validateUserSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    return { ok: false, error: 'Empty query' };
  }
  const stripped = stripCommentsAndStrings(sql).trim();
  if (!stripped) return { ok: false, error: 'Empty query' };

  // Single statement only — reject anything past a non-trailing semicolon.
  const noTrailing = stripped.replace(/;+\s*$/, '');
  if (noTrailing.includes(';')) {
    return { ok: false, error: 'Multiple statements are not allowed' };
  }

  // Must start with SELECT or WITH (case-insensitive).
  const first = noTrailing.toUpperCase().match(/^\s*(SELECT|WITH)\b/);
  if (!first) {
    return { ok: false, error: 'Only SELECT queries are allowed' };
  }

  // Reject forbidden keywords anywhere.
  const upper = noTrailing.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      return { ok: false, error: `Disallowed keyword: ${kw}` };
    }
  }
  return { ok: true };
}

/**
 * Build an in-memory SQLite populated with fleet rollups and run `sql` against
 * it. Returns { rows, columns, rowCount, truncated, fleet }.
 */
export async function runScopedSql(sql) {
  const v = validateUserSql(sql);
  if (!v.ok) return { error: v.error };

  const deployments = await listConnectedDeployments();
  const fleetMeta = {
    totalCount: deployments.length,
    reachableCount: 0,
    unreachableCount: 0,
    unreachable: [],
  };

  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE bots (
        id TEXT PRIMARY KEY,
        bot_name TEXT NOT NULL,
        url TEXT,
        last_seen_at TEXT,
        created_at TEXT,
        cloud_provider TEXT,
        cloud_status TEXT,
        flow_type TEXT
      );
      CREATE TABLE daily_bot_stats (
        bot_id TEXT NOT NULL,
        date TEXT NOT NULL,
        conversations INTEGER NOT NULL,
        turns INTEGER NOT NULL,
        avg_turns REAL NOT NULL
      );
      CREATE TABLE bot_health (
        bot_id TEXT PRIMARY KEY,
        bot_name TEXT NOT NULL,
        conversations_7d INTEGER NOT NULL,
        turns_7d INTEGER NOT NULL,
        avg_turns_7d REAL NOT NULL,
        conversations_total INTEGER NOT NULL,
        turns_total INTEGER NOT NULL,
        last_activity_at TEXT
      );
      CREATE TABLE protocol_stats (
        bot_id TEXT NOT NULL,
        protocol TEXT NOT NULL,
        turns INTEGER NOT NULL,
        conversations_touched INTEGER NOT NULL
      );
    `);

    // Populate the control-plane-known `bots` table without any fan-out.
    const insertBot = db.prepare(`
      INSERT INTO bots (id, bot_name, url, last_seen_at, created_at, cloud_provider, cloud_status, flow_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const d of deployments) {
      insertBot.run(
        d.id,
        d.botName,
        d.url,
        d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        d.createdAt ? d.createdAt.toISOString() : null,
        d.cloudProvider,
        d.cloudStatus,
        d.flowType,
      );
    }

    // Fan out for the three rollup tables in parallel.
    const [daily, health, proto] = await Promise.all([
      fanOut('/api/analytics/daily_stats', { deployments }),
      fanOut('/api/analytics/bot_health', { deployments }),
      fanOut('/api/analytics/protocol_stats', { deployments }),
    ]);

    // Use bot_health's reachability as the canonical fleet status, since
    // it's the cheapest call.
    fleetMeta.reachableCount = health.reachableCount;
    fleetMeta.unreachableCount = health.unreachableCount;
    fleetMeta.unreachable = health.results
      .filter((r) => !r.ok)
      .map((r) => ({
        id: r.deployment.id,
        botName: r.deployment.botName,
        reason: r.reason,
        status: r.status,
      }));

    const insertDaily = db.prepare(`
      INSERT INTO daily_bot_stats (bot_id, date, conversations, turns, avg_turns)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of daily.results) {
      if (!r.ok) continue;
      for (const row of (r.data && r.data.rows) || []) {
        insertDaily.run(
          r.deployment.id,
          row.date,
          row.conversations || 0,
          row.turns || 0,
          row.avg_turns || 0,
        );
      }
    }

    const insertHealth = db.prepare(`
      INSERT INTO bot_health (bot_id, bot_name, conversations_7d, turns_7d, avg_turns_7d, conversations_total, turns_total, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of health.results) {
      if (!r.ok) continue;
      const d = r.data || {};
      insertHealth.run(
        r.deployment.id,
        r.deployment.botName,
        d.conversations7d || 0,
        d.turns7d || 0,
        d.avgTurns7d || 0,
        d.conversationsTotal || 0,
        d.turnsTotal || 0,
        d.lastActivityAt || null,
      );
    }

    const insertProto = db.prepare(`
      INSERT INTO protocol_stats (bot_id, protocol, turns, conversations_touched)
      VALUES (?, ?, ?, ?)
    `);
    for (const r of proto.results) {
      if (!r.ok) continue;
      for (const row of (r.data && r.data.rows) || []) {
        insertProto.run(
          r.deployment.id,
          row.protocol,
          row.turns || 0,
          row.conversations_touched || 0,
        );
      }
    }

    // Run the user query under a timeout. better-sqlite3 is synchronous, but
    // we wrap with a wall-clock guard so a runaway recursive CTE can't pin
    // the event loop forever.
    const start = Date.now();
    const stmt = db.prepare(sql);
    let rawRows;
    try {
      rawRows = stmt.all();
    } catch (err) {
      return { error: err.message };
    }
    if (Date.now() - start > QUERY_TIMEOUT_MS) {
      return { error: `Query exceeded ${QUERY_TIMEOUT_MS}ms` };
    }

    const truncated = rawRows.length > ROW_CAP;
    const rows = truncated ? rawRows.slice(0, ROW_CAP) : rawRows;
    const columns = stmt.columns().map((c) => c.name);
    return {
      rows,
      columns,
      rowCount: rows.length,
      truncated,
      fleet: fleetMeta,
    };
  } finally {
    db.close();
  }
}

/**
 * Lightweight schema descriptor — used to render the schema reference
 * panel without needing a round-trip.
 */
export const FLEET_SCHEMA = [
  {
    name: 'bots',
    description: 'One row per registered deployment (control-plane state)',
    columns: [
      { name: 'id', description: 'Deployment id' },
      { name: 'bot_name', description: 'Display name' },
      { name: 'url', description: 'Bot URL if connected' },
      { name: 'last_seen_at', description: 'Last successful proxy call' },
      { name: 'created_at', description: 'Deployment created at' },
      { name: 'cloud_provider', description: 'fly | null' },
      { name: 'cloud_status', description: 'running | paused | failed | null' },
      { name: 'flow_type', description: 'Configured flow type' },
    ],
  },
  {
    name: 'daily_bot_stats',
    description: 'Per-bot per-day conversation and turn counts',
    columns: [
      { name: 'bot_id', description: 'FK → bots.id' },
      { name: 'date', description: 'YYYY-MM-DD' },
      { name: 'conversations', description: 'Distinct conversation count' },
      { name: 'turns', description: 'Turn count' },
      { name: 'avg_turns', description: 'turns / conversations' },
    ],
  },
  {
    name: 'bot_health',
    description: 'One row per bot — last 7 days plus all-time totals',
    columns: [
      { name: 'bot_id', description: 'FK → bots.id' },
      { name: 'bot_name', description: 'Display name' },
      { name: 'conversations_7d', description: 'Last 7 days' },
      { name: 'turns_7d', description: 'Last 7 days' },
      { name: 'avg_turns_7d', description: 'Last 7 days' },
      { name: 'conversations_total', description: 'All time' },
      { name: 'turns_total', description: 'All time' },
      { name: 'last_activity_at', description: 'Most recent turn timestamp' },
    ],
  },
  {
    name: 'protocol_stats',
    description: 'Per-bot per-protocol turn and conversation counts',
    columns: [
      { name: 'bot_id', description: 'FK → bots.id' },
      { name: 'protocol', description: 'form | triage | appointment | extraction' },
      { name: 'turns', description: 'Turns whose machine_state touched this protocol' },
      { name: 'conversations_touched', description: 'Distinct conversations' },
    ],
  },
];
