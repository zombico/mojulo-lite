import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocked before the SUT import so callOne dispatches to our fake fetchFromBot.
vi.mock('@/lib/deployers/bot-proxy', () => ({
  fetchFromBot: vi.fn(),
}));

// touchLastSeen is fire-and-forget — mock it so we can verify the call shape
// and inject a rejecting impl in the unhandled-rejection test.
vi.mock('@/lib/db/repositories/deployments', () => ({
  DeploymentRepository: {
    list: vi.fn(),
    touchLastSeen: vi.fn().mockResolvedValue(undefined),
  },
}));

const { fetchFromBot } = await import('@/lib/deployers/bot-proxy');
const { DeploymentRepository } = await import('@/lib/db/repositories/deployments');
const { fanOut, listConnectedDeployments } = await import('./bot-fleet.js');

const deployment = (overrides = {}) => ({
  id: overrides.id || 'd1',
  botName: overrides.botName || 'Bot1',
  url: overrides.url ?? 'http://bot1.local',
  apiKey: 'key',
  ...overrides,
});

const okResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('listConnectedDeployments', () => {
  it('returns only deployments with a url', async () => {
    DeploymentRepository.list.mockResolvedValue([
      deployment({ id: 'a', url: 'http://a.local' }),
      deployment({ id: 'b', url: null }),
      deployment({ id: 'c', url: '' }),
      deployment({ id: 'd', url: 'http://d.local' }),
    ]);

    const out = await listConnectedDeployments();
    expect(out.map((d) => d.id)).toEqual(['a', 'd']);
  });
});

describe('fanOut — error categorization', () => {
  it('reports timeout when fetchFromBot throws AbortError', async () => {
    fetchFromBot.mockImplementation(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    const out = await fanOut('/api/x', { deployments: [deployment()] });
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('reports network for any other thrown error', async () => {
    fetchFromBot.mockRejectedValue(new Error('ECONNREFUSED'));
    const out = await fanOut('/api/x', { deployments: [deployment()] });
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'network', message: 'ECONNREFUSED' });
  });

  it('reports bad_status when response.ok is false', async () => {
    fetchFromBot.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const out = await fanOut('/api/x', { deployments: [deployment()] });
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'bad_status', status: 503 });
  });

  it('reports bad_json when the body cannot be parsed', async () => {
    fetchFromBot.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Unexpected token'); },
    });
    const out = await fanOut('/api/x', { deployments: [deployment()] });
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'bad_json' });
  });
});

describe('fanOut — counts and ordering', () => {
  it('preserves input order in results[] regardless of completion order', async () => {
    fetchFromBot.mockImplementation(async (d) => {
      // Reverse-order resolution: 'c' resolves first, 'a' last.
      const delay = d.id === 'a' ? 30 : d.id === 'b' ? 15 : 0;
      await new Promise((r) => setTimeout(r, delay));
      return okResponse({ from: d.id });
    });

    const out = await fanOut('/api/x', {
      deployments: [deployment({ id: 'a' }), deployment({ id: 'b' }), deployment({ id: 'c' })],
    });
    expect(out.results.map((r) => r.data.from)).toEqual(['a', 'b', 'c']);
  });

  it('counts add up: reachable + unreachable == total', async () => {
    fetchFromBot.mockImplementation(async (d) => {
      if (d.id === 'b') return { ok: false, status: 500, json: async () => ({}) };
      return okResponse({});
    });

    const out = await fanOut('/api/x', {
      deployments: [deployment({ id: 'a' }), deployment({ id: 'b' }), deployment({ id: 'c' })],
    });
    expect(out.totalCount).toBe(3);
    expect(out.reachableCount).toBe(2);
    expect(out.unreachableCount).toBe(1);
    expect(out.reachableCount + out.unreachableCount).toBe(out.totalCount);
  });

  it('returns empty-clean shape for an empty deployments list', async () => {
    const out = await fanOut('/api/x', { deployments: [] });
    expect(out).toEqual({
      results: [],
      totalCount: 0,
      reachableCount: 0,
      unreachableCount: 0,
    });
    expect(fetchFromBot).not.toHaveBeenCalled();
  });
});

describe('fanOut — concurrency cap', () => {
  it('never has more than `concurrency` calls in flight at once', async () => {
    let inFlight = 0;
    let peak = 0;
    fetchFromBot.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return okResponse({});
    });

    const deployments = Array.from({ length: 12 }, (_, i) => deployment({ id: `d${i}` }));
    await fanOut('/api/x', { deployments, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(0);
  });
});

describe('fanOut — touchLastSeen behavior', () => {
  it('fires touchLastSeen for every reachable bot', async () => {
    fetchFromBot.mockResolvedValue(okResponse({}));
    const deployments = [deployment({ id: 'a' }), deployment({ id: 'b' })];

    await fanOut('/api/x', { deployments });
    // Allow the fire-and-forget .catch() to resolve.
    await new Promise((r) => setImmediate(r));

    expect(DeploymentRepository.touchLastSeen).toHaveBeenCalledTimes(2);
    expect(DeploymentRepository.touchLastSeen).toHaveBeenCalledWith('a');
    expect(DeploymentRepository.touchLastSeen).toHaveBeenCalledWith('b');
  });

  it('does NOT fire touchLastSeen for unreachable bots', async () => {
    fetchFromBot.mockRejectedValue(new Error('boom'));
    await fanOut('/api/x', { deployments: [deployment()] });
    expect(DeploymentRepository.touchLastSeen).not.toHaveBeenCalled();
  });

  it('rejected touchLastSeen does not surface as an unhandled rejection', async () => {
    fetchFromBot.mockResolvedValue(okResponse({}));
    DeploymentRepository.touchLastSeen.mockRejectedValueOnce(new Error('db locked'));

    const unhandled = [];
    const onRejection = (err) => unhandled.push(err);
    process.on('unhandledRejection', onRejection);
    try {
      const out = await fanOut('/api/x', { deployments: [deployment()] });
      expect(out.results[0].ok).toBe(true);
      // Give the .catch() a tick to run.
      await new Promise((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});
