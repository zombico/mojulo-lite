/**
 * MCP Ring 2.5 — fleet read tools.
 *
 * Peers of the dashboard's `/data` pane. Same fan-out substrate (bot-fleet.js),
 * same posture (no conversation content crosses to the control plane —
 * aggregates pass through process memory for the duration of one call).
 *
 * Shape rules enforced here (mirroring MCP-side feedback):
 *
 *   - Every fleet tool returns `unreachable: [{ botId, botName, reason, status? }]`
 *     in the same shape so the agent can detect "all bots responded?" with
 *     one check across tools.
 *   - Cache-backed tools return `cache: { fromCache, cachedAt, ttlMs }`
 *     so the agent can answer "is this current?" honestly.
 *   - Descriptions advertise rollup-only nature and point at the per-bot
 *     drill-in tool (`get_conversation`) for actual content.
 *   - Descriptions name operational realism (~1–3s warm, ~30s cold fan-out).
 *   - Tool names are prefixed `fleet_*` so the agent can tell at a glance
 *     which surface it's hitting.
 *
 * The fan-out path stays opportunistic: a slow / down bot doesn't block the
 * tool — its row lands in `unreachable[]` instead.
 */

import { fanOut, listConnectedDeployments } from '@/lib/deployers/bot-fleet';
import { registerTool } from '@/lib/mcp/server';

const CACHE_TTL_MS = 60_000;
const summaryCache = new Map(); // key -> { expiresAt, cachedAt, payload }

function normalizeUnreachable(unreachable) {
  return (unreachable || []).map((u) => ({
    botId: u.id,
    botName: u.botName,
    reason: u.reason,
    ...(u.status ? { status: u.status } : {}),
    ...(u.message ? { message: u.message } : {}),
  }));
}

function unreachableFromResults(results) {
  return results
    .filter((r) => !r.ok)
    .map((r) => ({
      botId: r.deployment.id,
      botName: r.deployment.botName,
      reason: r.reason,
      ...(r.status ? { status: r.status } : {}),
      ...(r.message ? { message: r.message } : {}),
    }));
}

function filterDeployments(all, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return all;
  const wanted = new Set(ids);
  return all.filter((d) => wanted.has(d.id));
}

function summaryCacheKey(startDate, endDate, deployments) {
  const ids = deployments.map((d) => d.id).sort().join(',');
  return `${startDate || ''}|${endDate || ''}|${ids}`;
}

async function fleetAnalyticsSummaryHandler(input, _ctx) {
  const { startDate, endDate, deploymentIds } = input || {};
  const all = await listConnectedDeployments();
  const deployments = filterDeployments(all, deploymentIds);

  const cacheKey = summaryCacheKey(startDate, endDate, deployments);
  const cached = summaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.payload,
      cache: {
        fromCache: true,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        ttlMs: CACHE_TTL_MS,
      },
    };
  }

  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', String(startDate));
  if (endDate) qs.set('endDate', String(endDate));
  const path = `/api/analytics/summary${qs.toString() ? `?${qs.toString()}` : ''}`;

  const { results, totalCount, reachableCount, unreachableCount } =
    await fanOut(path, { deployments });

  const totals = { conversations: 0, turns: 0 };
  const dailyMap = new Map();
  const heatMap = new Map();
  const perBot = [];

  for (const r of results) {
    if (!r.ok) continue;
    const d = r.data || {};
    const t = d.totals || {};
    totals.conversations += t.conversations || 0;
    totals.turns += t.turns || 0;
    perBot.push({
      botId: r.deployment.id,
      botName: r.deployment.botName,
      conversations: t.conversations || 0,
      turns: t.turns || 0,
      avgTurnsPerConversation: t.avgTurnsPerConversation || 0,
      firstAt: t.firstAt || null,
      lastAt: t.lastAt || null,
    });
    for (const row of d.daily || []) {
      const cur = dailyMap.get(row.date) || { conversations: 0, turns: 0 };
      cur.conversations += row.conversations || 0;
      cur.turns += row.turns || 0;
      dailyMap.set(row.date, cur);
    }
    for (const cell of d.heatmap || []) {
      const k = `${cell.dow}-${cell.hour}`;
      heatMap.set(k, (heatMap.get(k) || 0) + (cell.turns || 0));
    }
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const heatmap = Array.from(heatMap.entries()).map(([k, turns]) => {
    const [dow, hour] = k.split('-').map(Number);
    return { dow, hour, turns };
  });
  const topBots = [...perBot]
    .sort((a, b) => b.turns - a.turns)
    .slice(0, 10);

  // Pull a thin protocol mix per-call too — it's cheap and the dashboard
  // surfaces it implicitly via the SQL Explorer's protocol_stats table.
  const protoFan = await fanOut(path.replace('/summary', '/protocol_stats'), {
    deployments,
  });
  const protoMap = new Map();
  for (const r of protoFan.results) {
    if (!r.ok) continue;
    for (const row of (r.data && r.data.rows) || []) {
      const cur = protoMap.get(row.protocol) || { turns: 0, conversationsTouched: 0 };
      cur.turns += row.turns || 0;
      cur.conversationsTouched += row.conversations_touched || 0;
      protoMap.set(row.protocol, cur);
    }
  }
  const protocolMix = Array.from(protoMap.entries())
    .map(([protocol, v]) => ({ protocol, ...v }))
    .sort((a, b) => b.turns - a.turns);

  const payload = {
    totals: {
      ...totals,
      avgTurnsPerConversation: totals.conversations
        ? Number((totals.turns / totals.conversations).toFixed(2))
        : 0,
      activeBots: reachableCount,
      totalBots: totalCount,
    },
    daily,
    heatmap,
    topBots,
    protocolMix,
    perBot,
    unreachable: unreachableFromResults(results),
  };

  const now = Date.now();
  summaryCache.set(cacheKey, {
    expiresAt: now + CACHE_TTL_MS,
    cachedAt: now,
    payload,
  });
  if (summaryCache.size > 64) {
    for (const [k, v] of summaryCache.entries()) {
      if (v.expiresAt <= Date.now()) summaryCache.delete(k);
    }
  }

  return {
    ...payload,
    cache: {
      fromCache: false,
      cachedAt: new Date(now).toISOString(),
      ttlMs: CACHE_TTL_MS,
    },
  };
}

async function fleetQueryConversationsHandler(input, _ctx) {
  const {
    startDate,
    endDate,
    conversationId,
    deploymentIds,
    limit = 50,
    offset = 0,
  } = input || {};

  if (!startDate && !endDate && !conversationId) {
    throw new Error(
      'fleet_query_conversations requires at least one of startDate, endDate, or conversationId. The single-bot /api/conversations contract requires a filter — same here.',
    );
  }

  const all = await listConnectedDeployments();
  const deployments = filterDeployments(all, deploymentIds);

  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', String(startDate));
  if (endDate) qs.set('endDate', String(endDate));
  if (conversationId) qs.set('conversationId', String(conversationId));
  qs.set('limit', '50');
  qs.set('offset', '0');
  const path = `/api/conversations?${qs.toString()}`;

  const { results, totalCount, reachableCount, unreachableCount } =
    await fanOut(path, { deployments });

  const merged = [];
  for (const r of results) {
    if (!r.ok) continue;
    const convos = (r.data && r.data.conversations) || [];
    for (const c of convos) {
      merged.push({
        botId: r.deployment.id,
        botName: r.deployment.botName,
        conversationId: c.conversation_id,
        startedAt: c.started_at,
        lastActivity: c.last_activity,
        turnCount: c.turn_count,
      });
    }
  }

  merged.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  const cap = 500;
  const truncated = merged.length > cap;
  const capped = truncated ? merged.slice(0, cap) : merged;
  const page = capped.slice(offset, offset + limit);

  return {
    conversations: page,
    pagination: {
      limit,
      offset,
      total: capped.length,
      returned: page.length,
      hasMore: offset + page.length < capped.length,
      truncated,
    },
    fleet: {
      totalBots: totalCount,
      reachableBots: reachableCount,
      unreachableBots: unreachableCount,
    },
    unreachable: unreachableFromResults(results),
  };
}

async function verifyFleetChainsHandler(input, _ctx) {
  const { startDate, endDate, deploymentIds } = input || {};
  const all = await listConnectedDeployments();
  const deployments = filterDeployments(all, deploymentIds);

  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', String(startDate));
  if (endDate) qs.set('endDate', String(endDate));
  const path = `/api/verify/all${qs.toString() ? `?${qs.toString()}` : ''}`;

  const { results, totalCount, reachableCount, unreachableCount } =
    await fanOut(path, { deployments, timeoutMs: 30_000 });

  let totalTurns = 0;
  let invalidTurns = 0;
  let conversationsVerified = 0;
  const failed = [];
  const perBot = [];

  for (const r of results) {
    if (!r.ok) continue;
    const d = r.data || {};
    totalTurns += d.totalTurns || 0;
    invalidTurns += d.invalidTurns || 0;
    conversationsVerified += d.conversationsVerified || 0;
    perBot.push({
      botId: r.deployment.id,
      botName: r.deployment.botName,
      valid: !!d.valid,
      totalTurns: d.totalTurns || 0,
      invalidTurns: d.invalidTurns || 0,
      conversationsVerified: d.conversationsVerified || 0,
    });
    for (const f of d.failed || []) {
      failed.push({
        botId: r.deployment.id,
        botName: r.deployment.botName,
        conversationId: f.conversationId,
        turn: f.turn,
        timestamp: f.timestamp,
        reason: f.reason,
      });
    }
  }

  return {
    valid: invalidTurns === 0 && unreachableCount === 0,
    totalTurns,
    invalidTurns,
    conversationsVerified,
    failed,
    perBot,
    fleet: {
      totalBots: totalCount,
      reachableBots: reachableCount,
      unreachableBots: unreachableCount,
    },
    unreachable: unreachableFromResults(results),
  };
}

export function registerFleetTools() {
  registerTool({
    name: 'fleet_analytics_summary',
    description:
      "Fleet-wide activity rollup: totals, daily turn/conversation counts, top bots by activity, protocol usage mix, plus a per-bot breakdown keyed by botId. Aggregates and metadata only — for conversation content, use get_conversation against a specific bot (use fleet_query_conversations first to locate which bot a conversation lives on). Hits a 60s in-process cache shared with the dashboard's Analytics tab; cold (cache miss) takes ~1–3s warm, up to ~30s when every bot has to fan-out fresh. Response includes `cache: { fromCache, cachedAt, ttlMs }` so you can tell whether the data is current and `unreachable: [{ botId, botName, reason }]` so you can detect partial fleets. Optional `startDate`/`endDate` ISO bounds; optional `deploymentIds` to scope to a subset (default: every connected bot).",
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO timestamp lower bound on turn timestamp.' },
        endDate: { type: 'string', description: 'ISO timestamp upper bound on turn timestamp.' },
        deploymentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional — restrict the fan-out to these deployment ids. Defaults to every connected bot.',
        },
      },
    },
    handler: fleetAnalyticsSummaryHandler,
  });

  registerTool({
    name: 'fleet_query_conversations',
    description:
      "Locate conversations across every connected bot. Returns conversation summaries only — `{ botId, botName, conversationId, startedAt, lastActivity, turnCount }` — never turn content. To read a conversation's actual content, call `get_conversation` against the bot named by `botId`; the two-step pattern (fleet-locate, then per-bot-read) preserves the 'conversation data never crosses to the control plane' posture. Requires at least one of `startDate` / `endDate` / `conversationId` — same contract as the per-bot /api/conversations endpoint, which refuses unfiltered scans. Operational realism: typically 1–3s, up to ~30s cold across a large fleet. Response includes `unreachable: [{ botId, botName, reason }]` to flag bots that didn't answer.",
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO timestamp lower bound on first-turn timestamp.' },
        endDate: { type: 'string', description: 'ISO timestamp upper bound on first-turn timestamp.' },
        conversationId: { type: 'string', description: 'Optional substring match on conversation id.' },
        deploymentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional — restrict the fan-out to these deployment ids.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
    },
    handler: fleetQueryConversationsHandler,
  });

  registerTool({
    name: 'verify_fleet_chains',
    description:
      "Walk the tamper-evident hash chain across every connected bot in one call. This is the audit story scaled to fleet level — each bot still owns its own chain, but the aggregate roll-up is something only the control plane can produce. Returns `{ valid, totalTurns, invalidTurns, conversationsVerified, failed: [{ botId, botName, conversationId, turn, reason }], perBot: [...], unreachable: [...] }`. `valid: true` requires zero invalid turns AND zero unreachable bots — a fleet with dark bots can't be conclusively audited. Optional `startDate` / `endDate` ISO bounds narrow which conversations are walked. Operational realism: walks every turn on each reachable bot, so heavy fleets at full history take longer than other fleet tools — typically 2–10s, more on bots with very large databases.",
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', description: 'ISO timestamp lower bound on first-turn timestamp.' },
        endDate: { type: 'string', description: 'ISO timestamp upper bound on first-turn timestamp.' },
        deploymentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional — restrict the audit to these deployment ids.',
        },
      },
    },
    handler: verifyFleetChainsHandler,
  });
}

// Exported for tests.
export {
  fleetAnalyticsSummaryHandler,
  fleetQueryConversationsHandler,
  verifyFleetChainsHandler,
  normalizeUnreachable,
};
