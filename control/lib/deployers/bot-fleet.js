/**
 * Fleet fan-out helpers for the `/data` pane.
 *
 * Wraps the single-bot fetchFromBot pattern in a parallel-with-concurrency-cap
 * driver that hits every connected deployment. Returns per-bot results plus
 * a count of unreachable bots so callers can surface a partial-results banner.
 *
 * Nothing in this module touches the control-plane DB — aggregates live only
 * in process memory for the duration of one request.
 */

import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { fetchFromBot } from '@/lib/deployers/bot-proxy';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 8;

/**
 * Return all deployments that have a `url` set (i.e. Connect Bot has fired
 * at some point). We don't gate on freshness — a connected-but-stale bot
 * still gets the fan-out call; it just fails timeout and shows up in the
 * unreachable count.
 */
export async function listConnectedDeployments() {
  const all = await DeploymentRepository.list();
  return all.filter((d) => !!d.url);
}

/**
 * Fan a GET out to every connected deployment.
 *
 * @param {string} path - bot-side path (e.g. `/api/analytics/summary?...`)
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]   per-call timeout
 * @param {number} [opts.concurrency] max parallel in-flight calls
 * @param {Array}  [opts.deployments] override the deployment list (otherwise calls listConnectedDeployments)
 *
 * @returns {Promise<{
 *   results: Array<{ deployment: object, ok: true, data: any } | { deployment: object, ok: false, reason: string, status?: number, message?: string }>,
 *   totalCount: number,
 *   reachableCount: number,
 *   unreachableCount: number
 * }>}
 */
export async function fanOut(path, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    deployments,
  } = opts;

  const targets = deployments || (await listConnectedDeployments());
  const results = new Array(targets.length);

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const myIndex = cursor++;
      const deployment = targets[myIndex];
      results[myIndex] = await callOne(deployment, path, timeoutMs);
    }
  }

  const pool = Math.min(concurrency, targets.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));

  const reachableCount = results.filter((r) => r.ok).length;
  return {
    results,
    totalCount: targets.length,
    reachableCount,
    unreachableCount: targets.length - reachableCount,
  };
}

async function callOne(deployment, path, timeoutMs) {
  let response;
  try {
    response = await fetchFromBot(deployment, path, { timeoutMs });
  } catch (err) {
    return {
      deployment,
      ok: false,
      reason: err.name === 'AbortError' ? 'timeout' : 'network',
      message: err.message,
    };
  }
  if (!response.ok) {
    return {
      deployment,
      ok: false,
      reason: 'bad_status',
      status: response.status,
    };
  }
  let data;
  try {
    data = await response.json();
  } catch (err) {
    return {
      deployment,
      ok: false,
      reason: 'bad_json',
      message: err.message,
    };
  }
  // Don't await — best-effort freshness update.
  DeploymentRepository.touchLastSeen(deployment.id).catch(() => {});
  return { deployment, ok: true, data };
}
