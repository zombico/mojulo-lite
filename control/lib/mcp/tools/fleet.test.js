import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the fan-out substrate so the handlers can be exercised in isolation.
vi.mock('@/lib/deployers/bot-fleet', () => ({
  fanOut: vi.fn(),
  listConnectedDeployments: vi.fn(),
}));

const { fanOut, listConnectedDeployments } = await import('@/lib/deployers/bot-fleet');
const {
  fleetAnalyticsSummaryHandler,
  fleetQueryConversationsHandler,
  verifyFleetChainsHandler,
  normalizeUnreachable,
} = await import('./fleet.js');

const dep = (id, botName = `Bot ${id}`) => ({ id, botName, url: `http://${id}.local` });

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// normalizeUnreachable
// ─────────────────────────────────────────────────────────────────────────

describe('normalizeUnreachable', () => {
  it('renames id → botId and omits absent status/message keys', () => {
    const out = normalizeUnreachable([
      { id: 'a', botName: 'A', reason: 'timeout' },
      { id: 'b', botName: 'B', reason: 'bad_status', status: 503 },
      { id: 'c', botName: 'C', reason: 'network', message: 'ECONNREFUSED' },
    ]);
    expect(out).toEqual([
      { botId: 'a', botName: 'A', reason: 'timeout' },
      { botId: 'b', botName: 'B', reason: 'bad_status', status: 503 },
      { botId: 'c', botName: 'C', reason: 'network', message: 'ECONNREFUSED' },
    ]);
    // No `status` key at all on rows that don't have one.
    expect('status' in out[0]).toBe(false);
    expect('message' in out[0]).toBe(false);
  });

  it('returns empty array for nullish input', () => {
    expect(normalizeUnreachable(undefined)).toEqual([]);
    expect(normalizeUnreachable(null)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// fleetAnalyticsSummaryHandler
// ─────────────────────────────────────────────────────────────────────────

describe('fleetAnalyticsSummaryHandler', () => {
  function summaryFanOutFor(perBot, unreachable = []) {
    return {
      totalCount: perBot.length + unreachable.length,
      reachableCount: perBot.length,
      unreachableCount: unreachable.length,
      results: [
        ...perBot.map((b) => ({ deployment: dep(b.id, b.botName), ok: true, data: b.data })),
        ...unreachable.map((u) => ({ deployment: dep(u.id, u.botName), ok: false, reason: u.reason, status: u.status })),
      ],
    };
  }

  it('sums totals and computes avgTurnsPerConversation', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockImplementation(async (path) => {
      if (path.startsWith('/api/analytics/summary')) {
        return summaryFanOutFor([
          { id: 'a', data: { totals: { conversations: 10, turns: 30 }, daily: [], heatmap: [] } },
          { id: 'b', data: { totals: { conversations: 5, turns: 25 }, daily: [], heatmap: [] } },
        ]);
      }
      return summaryFanOutFor([]); // protocol_stats
    });

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'sums-test-1' });
    expect(out.totals.conversations).toBe(15);
    expect(out.totals.turns).toBe(55);
    expect(out.totals.avgTurnsPerConversation).toBe(3.67);
    expect(out.totals.activeBots).toBe(2);
    expect(out.totals.totalBots).toBe(2);
  });

  it('reports avgTurnsPerConversation as 0 (not NaN) when no conversations', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue(summaryFanOutFor([
      { id: 'a', data: { totals: { conversations: 0, turns: 0 }, daily: [], heatmap: [] } },
    ]));

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'avg-zero-test' });
    expect(out.totals.avgTurnsPerConversation).toBe(0);
    expect(Number.isNaN(out.totals.avgTurnsPerConversation)).toBe(false);
  });

  it('sorts daily breakdown ascending by date even when bots return out of order', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockImplementation(async (path) => {
      if (path.startsWith('/api/analytics/summary')) {
        return summaryFanOutFor([
          { id: 'a', data: { totals: {}, daily: [{ date: '2026-05-03', conversations: 1, turns: 3 }, { date: '2026-05-01', conversations: 2, turns: 4 }], heatmap: [] } },
          { id: 'b', data: { totals: {}, daily: [{ date: '2026-05-02', conversations: 5, turns: 9 }], heatmap: [] } },
        ]);
      }
      return summaryFanOutFor([]);
    });

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'daily-sort-test' });
    expect(out.daily.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  it('merges heatmap cells by (dow,hour) across bots', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockImplementation(async (path) => {
      if (path.startsWith('/api/analytics/summary')) {
        return summaryFanOutFor([
          { id: 'a', data: { totals: {}, daily: [], heatmap: [{ dow: 1, hour: 10, turns: 4 }] } },
          { id: 'b', data: { totals: {}, daily: [], heatmap: [{ dow: 1, hour: 10, turns: 6 }, { dow: 2, hour: 15, turns: 3 }] } },
        ]);
      }
      return summaryFanOutFor([]);
    });

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'heatmap-test' });
    const m110 = out.heatmap.find((c) => c.dow === 1 && c.hour === 10);
    const m215 = out.heatmap.find((c) => c.dow === 2 && c.hour === 15);
    expect(m110.turns).toBe(10);
    expect(m215.turns).toBe(3);
  });

  it('caps topBots at 10 and sorts by turns desc', async () => {
    const bots = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      data: { totals: { conversations: 1, turns: 100 - i }, daily: [], heatmap: [] },
    }));
    listConnectedDeployments.mockResolvedValue(bots.map((b) => dep(b.id)));
    fanOut.mockImplementation(async (path) => {
      if (path.startsWith('/api/analytics/summary')) return summaryFanOutFor(bots);
      return summaryFanOutFor([]);
    });

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'topbots-test' });
    expect(out.topBots.length).toBe(10);
    expect(out.topBots[0].turns).toBeGreaterThanOrEqual(out.topBots[9].turns);
    expect(out.topBots[0].turns).toBe(100);
  });

  it('returns protocolMix sorted by turns desc, merged across bots', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockImplementation(async (path) => {
      if (path.startsWith('/api/analytics/summary')) {
        return summaryFanOutFor([
          { id: 'a', data: { totals: {}, daily: [], heatmap: [] } },
          { id: 'b', data: { totals: {}, daily: [], heatmap: [] } },
        ]);
      }
      // protocol_stats fan-out
      return summaryFanOutFor([
        { id: 'a', data: { rows: [{ protocol: 'knowledge', turns: 4, conversations_touched: 2 }, { protocol: 'triage', turns: 1, conversations_touched: 1 }] } },
        { id: 'b', data: { rows: [{ protocol: 'knowledge', turns: 3, conversations_touched: 1 }] } },
      ]);
    });

    const out = await fleetAnalyticsSummaryHandler({ startDate: 'protomix-test' });
    expect(out.protocolMix).toEqual([
      { protocol: 'knowledge', turns: 7, conversationsTouched: 3 },
      { protocol: 'triage', turns: 1, conversationsTouched: 1 },
    ]);
  });

  // Regression guard for the fragile path.replace('/summary', '/protocol_stats')
  // at fleet.js:135 — if the path construction changes shape, the swap silently
  // hits the wrong endpoint.
  it('swaps /summary → /protocol_stats while preserving query string', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    const calls = [];
    fanOut.mockImplementation(async (path) => {
      calls.push(path);
      return summaryFanOutFor([{ id: 'a', data: { totals: {}, daily: [], heatmap: [] } }]);
    });

    await fleetAnalyticsSummaryHandler({ startDate: '2026-01-01', endDate: '2026-02-01' });
    expect(calls).toContain('/api/analytics/summary?startDate=2026-01-01&endDate=2026-02-01');
    expect(calls).toContain('/api/analytics/protocol_stats?startDate=2026-01-01&endDate=2026-02-01');
  });

  it('builds an unparameterized path when no dates are supplied', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    const calls = [];
    fanOut.mockImplementation(async (path) => {
      calls.push(path);
      return summaryFanOutFor([{ id: 'a', data: { totals: {}, daily: [], heatmap: [] } }]);
    });

    // No startDate ⇒ shares a cache slot with other no-date callers; use a
    // unique deploymentIds to keep this test isolated.
    await fleetAnalyticsSummaryHandler({ deploymentIds: ['a'] });
    expect(calls[0]).toBe('/api/analytics/summary');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// fleetAnalyticsSummaryHandler — cache
// ─────────────────────────────────────────────────────────────────────────

describe('fleetAnalyticsSummaryHandler — cache', () => {
  // Each test uses a unique startDate to claim its own cache key, sidestepping
  // the lack of a clearCache test seam.
  function setupOneFleet(id = 'a') {
    listConnectedDeployments.mockResolvedValue([dep(id)]);
    fanOut.mockImplementation(async () => ({
      results: [{ deployment: dep(id), ok: true, data: { totals: { conversations: 1, turns: 2 }, daily: [], heatmap: [] } }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    }));
  }

  it('marks fromCache:false on cold call, fromCache:true on warm', async () => {
    setupOneFleet();
    const first = await fleetAnalyticsSummaryHandler({ startDate: 'cache-cold-warm' });
    expect(first.cache.fromCache).toBe(false);

    const callsBefore = fanOut.mock.calls.length;
    const second = await fleetAnalyticsSummaryHandler({ startDate: 'cache-cold-warm' });
    expect(second.cache.fromCache).toBe(true);
    expect(second.cache.cachedAt).toBe(first.cache.cachedAt);
    // Cache hit must NOT fan out again.
    expect(fanOut.mock.calls.length).toBe(callsBefore);
  });

  it('cache key is order-independent on deploymentIds', async () => {
    listConnectedDeployments.mockResolvedValue([dep('x'), dep('y')]);
    fanOut.mockResolvedValue({
      results: [
        { deployment: dep('x'), ok: true, data: { totals: {}, daily: [], heatmap: [] } },
        { deployment: dep('y'), ok: true, data: { totals: {}, daily: [], heatmap: [] } },
      ],
      totalCount: 2, reachableCount: 2, unreachableCount: 0,
    });

    const first = await fleetAnalyticsSummaryHandler({ startDate: 'cache-order', deploymentIds: ['x', 'y'] });
    const second = await fleetAnalyticsSummaryHandler({ startDate: 'cache-order', deploymentIds: ['y', 'x'] });
    expect(second.cache.fromCache).toBe(true);
    expect(second.cache.cachedAt).toBe(first.cache.cachedAt);
  });

  it('different date ranges miss each other in the cache', async () => {
    setupOneFleet('z');
    const a = await fleetAnalyticsSummaryHandler({ startDate: 'cache-isolation-A' });
    const b = await fleetAnalyticsSummaryHandler({ startDate: 'cache-isolation-B' });
    expect(a.cache.fromCache).toBe(false);
    expect(b.cache.fromCache).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// fleetQueryConversationsHandler
// ─────────────────────────────────────────────────────────────────────────

describe('fleetQueryConversationsHandler', () => {
  it('throws when none of startDate / endDate / conversationId is supplied', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    await expect(fleetQueryConversationsHandler({})).rejects.toThrow(
      /at least one of startDate, endDate, or conversationId/,
    );
    expect(fanOut).not.toHaveBeenCalled();
  });

  it('accepts conversationId alone as a sufficient filter', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue({
      results: [{ deployment: dep('a'), ok: true, data: { conversations: [] } }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    });
    await expect(fleetQueryConversationsHandler({ conversationId: 'abc' })).resolves.toBeDefined();
  });

  // Documented design choice — pinning so a refactor that "fixes" this is
  // forced to acknowledge the trade-off.
  it('forces limit=50&offset=0 on the per-bot fetch regardless of user input', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    let observed;
    fanOut.mockImplementation(async (path) => {
      observed = path;
      return { results: [{ deployment: dep('a'), ok: true, data: { conversations: [] } }], totalCount: 1, reachableCount: 1, unreachableCount: 0 };
    });

    await fleetQueryConversationsHandler({ startDate: '2026-01-01', limit: 200, offset: 10 });
    expect(observed).toContain('limit=50');
    expect(observed).toContain('offset=0');
  });

  it('merges conversations across bots sorted by lastActivity desc', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockResolvedValue({
      results: [
        { deployment: dep('a'), ok: true, data: { conversations: [
          { conversation_id: 'c1', started_at: '2026-05-01', last_activity: '2026-05-10', turn_count: 3 },
          { conversation_id: 'c3', started_at: '2026-05-03', last_activity: '2026-05-12', turn_count: 1 },
        ] } },
        { deployment: dep('b'), ok: true, data: { conversations: [
          { conversation_id: 'c2', started_at: '2026-05-02', last_activity: '2026-05-11', turn_count: 2 },
        ] } },
      ],
      totalCount: 2, reachableCount: 2, unreachableCount: 0,
    });

    const out = await fleetQueryConversationsHandler({ startDate: '2026-01-01' });
    expect(out.conversations.map((c) => c.conversationId)).toEqual(['c3', 'c2', 'c1']);
    expect(out.conversations[0]).toMatchObject({ botId: 'a', botName: 'Bot a', conversationId: 'c3', turnCount: 1 });
  });

  it('paginates the merged list with the user-supplied limit/offset', async () => {
    const convos = Array.from({ length: 7 }, (_, i) => ({
      conversation_id: `c${i}`,
      started_at: '2026-05-01',
      last_activity: `2026-05-${String(20 - i).padStart(2, '0')}`,
      turn_count: 1,
    }));
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue({
      results: [{ deployment: dep('a'), ok: true, data: { conversations: convos } }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    });

    const out = await fleetQueryConversationsHandler({ startDate: '2026-01-01', limit: 3, offset: 2 });
    expect(out.conversations.length).toBe(3);
    expect(out.pagination).toEqual({
      limit: 3,
      offset: 2,
      total: 7,
      returned: 3,
      hasMore: true,
      truncated: false,
    });
  });

  it('flags truncated:true when merged set exceeds the 500 cap', async () => {
    const convos = Array.from({ length: 501 }, (_, i) => ({
      conversation_id: `c${i}`,
      started_at: '2026-05-01',
      last_activity: '2026-05-10',
      turn_count: 1,
    }));
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue({
      results: [{ deployment: dep('a'), ok: true, data: { conversations: convos } }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    });

    const out = await fleetQueryConversationsHandler({ startDate: '2026-01-01' });
    expect(out.pagination.truncated).toBe(true);
    expect(out.pagination.total).toBe(500);
  });

  it('surfaces unreachable bots in the response without dropping reachable rows', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockResolvedValue({
      results: [
        { deployment: dep('a'), ok: true, data: { conversations: [
          { conversation_id: 'c1', started_at: '2026-05-01', last_activity: '2026-05-10', turn_count: 3 },
        ] } },
        { deployment: dep('b'), ok: false, reason: 'timeout' },
      ],
      totalCount: 2, reachableCount: 1, unreachableCount: 1,
    });

    const out = await fleetQueryConversationsHandler({ startDate: '2026-01-01' });
    expect(out.conversations.length).toBe(1);
    expect(out.fleet).toEqual({ totalBots: 2, reachableBots: 1, unreachableBots: 1 });
    expect(out.unreachable).toEqual([{ botId: 'b', botName: 'Bot b', reason: 'timeout' }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// verifyFleetChainsHandler
// ─────────────────────────────────────────────────────────────────────────

describe('verifyFleetChainsHandler', () => {
  it('reports valid:true only when zero invalid AND zero unreachable', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockResolvedValue({
      results: [
        { deployment: dep('a'), ok: true, data: { valid: true, totalTurns: 10, invalidTurns: 0, conversationsVerified: 3, failed: [] } },
        { deployment: dep('b'), ok: true, data: { valid: true, totalTurns: 5, invalidTurns: 0, conversationsVerified: 2, failed: [] } },
      ],
      totalCount: 2, reachableCount: 2, unreachableCount: 0,
    });

    const out = await verifyFleetChainsHandler({});
    expect(out.valid).toBe(true);
    expect(out.totalTurns).toBe(15);
    expect(out.conversationsVerified).toBe(5);
  });

  it('reports valid:false when any unreachable, even if all reachable bots pass', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a'), dep('b')]);
    fanOut.mockResolvedValue({
      results: [
        { deployment: dep('a'), ok: true, data: { valid: true, totalTurns: 10, invalidTurns: 0, conversationsVerified: 3, failed: [] } },
        { deployment: dep('b'), ok: false, reason: 'timeout' },
      ],
      totalCount: 2, reachableCount: 1, unreachableCount: 1,
    });

    const out = await verifyFleetChainsHandler({});
    expect(out.valid).toBe(false);
    expect(out.unreachable).toEqual([{ botId: 'b', botName: 'Bot b', reason: 'timeout' }]);
  });

  it('aggregates failed[] with botId/botName attached to each entry', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue({
      results: [{
        deployment: dep('a'),
        ok: true,
        data: {
          valid: false, totalTurns: 4, invalidTurns: 2, conversationsVerified: 1,
          failed: [
            { conversationId: 'cv-1', turn: 2, timestamp: '2026-05-10', reason: 'chain_hash_mismatch' },
            { conversationId: 'cv-1', turn: 3, timestamp: '2026-05-10', reason: 'content_hash_mismatch' },
          ],
        },
      }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    });

    const out = await verifyFleetChainsHandler({});
    expect(out.invalidTurns).toBe(2);
    expect(out.failed).toEqual([
      { botId: 'a', botName: 'Bot a', conversationId: 'cv-1', turn: 2, timestamp: '2026-05-10', reason: 'chain_hash_mismatch' },
      { botId: 'a', botName: 'Bot a', conversationId: 'cv-1', turn: 3, timestamp: '2026-05-10', reason: 'content_hash_mismatch' },
    ]);
  });

  // Pin the 30s override — verify can walk huge per-bot chains and the default
  // 10s timeout would clip large fleets.
  it('passes a 30s timeout to fanOut', async () => {
    listConnectedDeployments.mockResolvedValue([dep('a')]);
    fanOut.mockResolvedValue({
      results: [{ deployment: dep('a'), ok: true, data: { valid: true, totalTurns: 0, invalidTurns: 0, conversationsVerified: 0, failed: [] } }],
      totalCount: 1, reachableCount: 1, unreachableCount: 0,
    });

    await verifyFleetChainsHandler({});
    expect(fanOut).toHaveBeenCalledWith(
      expect.stringContaining('/api/verify/all'),
      expect.objectContaining({ timeoutMs: 30_000 }),
    );
  });
});
