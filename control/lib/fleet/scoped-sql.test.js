import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked before the SUT import so the dynamic import resolves with the doubles.
vi.mock('@/lib/deployers/bot-fleet', () => ({
  fanOut: vi.fn(),
  listConnectedDeployments: vi.fn(),
}));

const { fanOut, listConnectedDeployments } = await import('@/lib/deployers/bot-fleet');
const { validateUserSql, runScopedSql, FLEET_SCHEMA } = await import('./scoped-sql.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateUserSql — happy paths', () => {
  it('accepts a bare SELECT', () => {
    expect(validateUserSql('SELECT 1')).toEqual({ ok: true });
  });

  it('accepts a WITH (CTE) statement', () => {
    expect(validateUserSql('WITH x AS (SELECT 1) SELECT * FROM x')).toEqual({ ok: true });
  });

  it('accepts a single trailing semicolon', () => {
    expect(validateUserSql('SELECT 1;')).toEqual({ ok: true });
    expect(validateUserSql('SELECT 1;   ')).toEqual({ ok: true });
    expect(validateUserSql('SELECT 1;;\n')).toEqual({ ok: true });
  });

  it('is case-insensitive on the leading verb', () => {
    expect(validateUserSql('select 1').ok).toBe(true);
    expect(validateUserSql('  WITH x AS (SELECT 1) SELECT 1').ok).toBe(true);
  });
});

describe('validateUserSql — rejections', () => {
  it('rejects empty / whitespace-only / non-string', () => {
    expect(validateUserSql('')).toEqual({ ok: false, error: 'Empty query' });
    expect(validateUserSql('   \n\t  ')).toEqual({ ok: false, error: 'Empty query' });
    expect(validateUserSql(null)).toEqual({ ok: false, error: 'Empty query' });
    expect(validateUserSql(undefined)).toEqual({ ok: false, error: 'Empty query' });
    expect(validateUserSql(123)).toEqual({ ok: false, error: 'Empty query' });
  });

  it('rejects non-SELECT/WITH leaders', () => {
    expect(validateUserSql('EXPLAIN SELECT 1')).toEqual({ ok: false, error: 'Only SELECT queries are allowed' });
  });

  it('rejects multi-statement queries', () => {
    const r = validateUserSql('SELECT 1; SELECT 2');
    expect(r).toEqual({ ok: false, error: 'Multiple statements are not allowed' });
  });

  it('rejects bare forbidden statements at the leader check', () => {
    // Bare-statement payloads (INSERT, DROP, PRAGMA, ...) are caught by the
    // SELECT/WITH leader check *before* the forbidden-verb scan ever runs.
    // The verb scan is defense-in-depth for verbs hiding inside otherwise-
    // SELECT/WITH-led queries (covered separately below).
    for (const sql of [
      'INSERT INTO bots VALUES (1)',
      'DELETE FROM bots',
      'DROP TABLE bots',
      'PRAGMA journal_mode',
      'VACUUM',
    ]) {
      expect(validateUserSql(sql)).toEqual({ ok: false, error: 'Only SELECT queries are allowed' });
    }
  });

  // Defense-in-depth: with a SELECT/WITH leader, the forbidden-verb regex
  // is what catches a destructive token. Crafted payloads here are not
  // necessarily valid SQL — the validator's job is to reject them *before*
  // SQLite ever sees them.
  it.each([
    ['INSERT'],
    ['UPDATE'],
    ['DELETE'],
    ['REPLACE'],
    ['DROP'],
    ['ALTER'],
    ['CREATE'],
    ['TRUNCATE'],
    ['ATTACH'],
    ['DETACH'],
    ['PRAGMA'],
    ['VACUUM'],
    ['REINDEX'],
    ['ANALYZE'],
  ])('rejects %s as a token inside a SELECT-led query', (kw) => {
    const r = validateUserSql(`SELECT 1 WHERE ${kw} = 0`);
    expect(r).toEqual({ ok: false, error: `Disallowed keyword: ${kw}` });
  });

  it('rejects forbidden verbs case-insensitively', () => {
    expect(validateUserSql('SELECT 1 WHERE DeLeTe = 0').ok).toBe(false);
  });

  it('rejects a forbidden verb that appears after a SELECT', () => {
    expect(validateUserSql('SELECT 1 UNION SELECT 1 DROP TABLE bots').ok).toBe(false);
  });
});

describe('validateUserSql — smuggling defenses', () => {
  it('is not fooled by forbidden verbs inside string literals', () => {
    expect(validateUserSql("SELECT 'DELETE FROM bots' AS x").ok).toBe(true);
    expect(validateUserSql("SELECT 'DROP', 'PRAGMA' FROM bots").ok).toBe(true);
  });

  it("handles SQL '' escape inside literals", () => {
    expect(validateUserSql("SELECT 'it''s DELETE' AS x").ok).toBe(true);
  });

  it('is not fooled by forbidden verbs inside -- line comments', () => {
    expect(validateUserSql('SELECT 1 -- DELETE FROM bots').ok).toBe(true);
  });

  it('is not fooled by forbidden verbs inside /* */ block comments', () => {
    expect(validateUserSql('SELECT 1 /* DROP TABLE bots */ FROM bots').ok).toBe(true);
  });

  // Documented behavior: stripCommentsAndStrings keeps double-quoted identifier
  // contents (they're not keywords). Pin this so a future "also strip dq" change
  // surfaces the trade-off — and so the schema reference panel keeps working
  // with quoted reserved-word column names.
  it('treats double-quoted contents as identifiers, not strings', () => {
    expect(validateUserSql('SELECT "delete" FROM bots').ok).toBe(false);
  });

  // Regex uses \b boundaries — a forbidden word as a substring of a larger
  // identifier must NOT match.
  it('does not match forbidden verbs as identifier substrings', () => {
    expect(validateUserSql('SELECT created_at FROM bots').ok).toBe(true);
    expect(validateUserSql('SELECT updated_at FROM bots').ok).toBe(true);
  });
});

describe('runScopedSql — empty fleet', () => {
  it('returns clean shape with zero rows and no fan-out errors', async () => {
    listConnectedDeployments.mockResolvedValue([]);
    fanOut.mockResolvedValue({
      results: [],
      totalCount: 0,
      reachableCount: 0,
      unreachableCount: 0,
    });

    const out = await runScopedSql('SELECT * FROM bots');
    expect(out.error).toBeUndefined();
    expect(out.rows).toEqual([]);
    expect(out.columns).toEqual(expect.arrayContaining(['id', 'bot_name']));
    expect(out.rowCount).toBe(0);
    expect(out.truncated).toBe(false);
    expect(out.fleet).toEqual({
      totalCount: 0,
      reachableCount: 0,
      unreachableCount: 0,
      unreachable: [],
    });
  });

  it('short-circuits on validator rejection without fanning out', async () => {
    const out = await runScopedSql('DELETE FROM bots');
    expect(out.error).toBe('Only SELECT queries are allowed');
    expect(listConnectedDeployments).not.toHaveBeenCalled();
    expect(fanOut).not.toHaveBeenCalled();
  });

  it('short-circuits on a SELECT-led forbidden-verb rejection too', async () => {
    const out = await runScopedSql('SELECT 1 WHERE DELETE = 0');
    expect(out.error).toBe('Disallowed keyword: DELETE');
    expect(fanOut).not.toHaveBeenCalled();
  });
});

describe('runScopedSql — population from fan-out', () => {
  const deployment = (id, botName) => ({
    id,
    botName,
    url: `http://${id}.local`,
    lastSeenAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2025-12-01T00:00:00Z'),
    cloudProvider: 'fly',
    cloudStatus: 'running',
    flowType: 'knowledge',
  });

  it('populates `bots` from listConnectedDeployments without any fan-out', async () => {
    const deployments = [deployment('a', 'Alpha'), deployment('b', 'Beta')];
    listConnectedDeployments.mockResolvedValue(deployments);
    fanOut.mockResolvedValue({
      results: deployments.map((d) => ({ deployment: d, ok: true, data: { rows: [] } })),
      totalCount: 2,
      reachableCount: 2,
      unreachableCount: 0,
    });

    const out = await runScopedSql('SELECT id, bot_name, cloud_provider FROM bots ORDER BY id');
    expect(out.rows).toEqual([
      { id: 'a', bot_name: 'Alpha', cloud_provider: 'fly' },
      { id: 'b', bot_name: 'Beta', cloud_provider: 'fly' },
    ]);
  });

  it('serializes Date columns as ISO strings and preserves nulls', async () => {
    const d = {
      ...deployment('a', 'Alpha'),
      lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: null,
    };
    listConnectedDeployments.mockResolvedValue([d]);
    fanOut.mockResolvedValue({ results: [], totalCount: 1, reachableCount: 1, unreachableCount: 0 });

    const out = await runScopedSql('SELECT last_seen_at, created_at FROM bots');
    expect(out.rows[0]).toEqual({
      last_seen_at: '2026-01-01T00:00:00.000Z',
      created_at: null,
    });
  });

  it('mixes reachable and unreachable bots — drops unreachable rows, surfaces them in fleet.unreachable', async () => {
    const alpha = deployment('a', 'Alpha');
    const beta = deployment('b', 'Beta');
    listConnectedDeployments.mockResolvedValue([alpha, beta]);

    fanOut.mockImplementation(async (path) => {
      // daily_stats: alpha reachable with 1 row, beta unreachable
      if (path.includes('daily_stats')) {
        return {
          results: [
            { deployment: alpha, ok: true, data: { rows: [{ date: '2026-05-01', conversations: 3, turns: 10, avg_turns: 3.33 }] } },
            { deployment: beta, ok: false, reason: 'timeout' },
          ],
          totalCount: 2, reachableCount: 1, unreachableCount: 1,
        };
      }
      // bot_health: same shape — drives fleet.* counts (see scoped-sql.js comment)
      if (path.includes('bot_health')) {
        return {
          results: [
            { deployment: alpha, ok: true, data: { conversations7d: 5, turns7d: 20, avgTurns7d: 4, conversationsTotal: 50, turnsTotal: 200, lastActivityAt: '2026-05-17T12:00:00Z' } },
            { deployment: beta, ok: false, reason: 'bad_status', status: 503 },
          ],
          totalCount: 2, reachableCount: 1, unreachableCount: 1,
        };
      }
      return { results: [], totalCount: 2, reachableCount: 1, unreachableCount: 1 };
    });

    const out = await runScopedSql('SELECT bot_id, conversations FROM daily_bot_stats');
    expect(out.rows).toEqual([{ bot_id: 'a', conversations: 3 }]);

    // bot_health drives the fleet.* counts — this is intentional (it's the
    // cheapest fan-out call), and a regression here would silently misreport
    // health on the dashboard.
    expect(out.fleet.reachableCount).toBe(1);
    expect(out.fleet.unreachableCount).toBe(1);
    expect(out.fleet.unreachable).toEqual([
      { id: 'b', botName: 'Beta', reason: 'bad_status', status: 503 },
    ]);
  });

  // BUG / CURRENT BEHAVIOR: `db.prepare(sql)` in scoped-sql.js sits *outside*
  // the try/catch that wraps `stmt.all()`. So prepare-time errors throw to
  // the caller instead of being normalized into `{ error }` as the design
  // comment suggests. Pinned here so a future fix (wrap prepare in the
  // try/catch) fails this test and prompts the dev to update it.
  it('throws on a SQL prepare-time error (current behavior — not wrapped in { error })', async () => {
    listConnectedDeployments.mockResolvedValue([]);
    fanOut.mockResolvedValue({ results: [], totalCount: 0, reachableCount: 0, unreachableCount: 0 });

    await expect(runScopedSql('SELECT * FROM nonexistent_table')).rejects.toThrow(/no such table/);
  });

  it('flags `truncated: true` when results exceed ROW_CAP', async () => {
    listConnectedDeployments.mockResolvedValue([]);
    fanOut.mockResolvedValue({ results: [], totalCount: 0, reachableCount: 0, unreachableCount: 0 });

    // Recursive CTE generates 10_001 rows cheaply — exceeds ROW_CAP of 10_000.
    const sql = `
      WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 10001
      )
      SELECT n FROM seq
    `;
    const out = await runScopedSql(sql);
    expect(out.truncated).toBe(true);
    expect(out.rowCount).toBe(10_000);
  });
});

describe('FLEET_SCHEMA — drift guard', () => {
  it('lists exactly the four tables that runScopedSql creates', async () => {
    listConnectedDeployments.mockResolvedValue([]);
    fanOut.mockResolvedValue({ results: [], totalCount: 0, reachableCount: 0, unreachableCount: 0 });

    const out = await runScopedSql("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    const actual = out.rows.map((r) => r.name);
    const declared = FLEET_SCHEMA.map((s) => s.name).sort();
    expect(actual).toEqual(declared);
  });
});
