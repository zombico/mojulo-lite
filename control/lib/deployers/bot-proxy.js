/**
 * Helpers for talking to a registered (running) lite bot.
 *
 * The operator pastes the bot's URL on a deployment row; the row's existing
 * api_key is the same value the bot validates as `x-mojulo-api-key`
 * (see lib/deployers/docker.js — the build writes MOJULO_API_KEY=<row.api_key>
 * into the artifact's .env).
 */

const PROBE_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30000;

export function normalizeBotUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
}

export async function fetchFromBot(deployment, path, { method = 'GET', timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (!deployment?.url) {
    throw new Error('Bot is not connected');
  }
  const target = `${deployment.url}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(target, {
      method,
      headers: { 'x-mojulo-api-key': deployment.apiKey },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe a candidate URL with the row's api_key. Hits /api/conversations with
 * no search params — the lite container returns 200 + count even with no
 * params, which validates both reachability AND key.
 */
export async function probeBotConnection(url, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/conversations`, {
      headers: { 'x-mojulo-api-key': apiKey },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized', status: res.status };
    }
    if (!res.ok) {
      return { ok: false, reason: 'bad_status', status: res.status };
    }
    return { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'network', message: err.message };
  } finally {
    clearTimeout(timer);
  }
}
