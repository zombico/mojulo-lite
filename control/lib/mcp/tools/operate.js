/**
 * MCP Ring 2 — operate / read tools.
 *
 * Lets the user's Claude reason over deployed bot state without exposing new
 * HTTP endpoints from the control plane. Reads either hit local SQLite
 * (deployment metadata) or pass through bot-proxy to the bot's own SQLite
 * (conversations, submissions, chain verification) — preserving the
 * "conversation data never leaves the bot's SQLite" invariant.
 *
 * Transcript-touching tools (everything below `list_deployments` /
 * `get_deployment`) are gated behind MCP_EXPOSE_CONVERSATIONS=1 so the
 * read surface is opt-in.
 */

import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { fetchFromBot } from '@/lib/deployers/bot-proxy';
import { registerTool } from '@/lib/mcp/server';

function summarizeDeployment(d) {
  if (!d) return null;
  return {
    id: d.id,
    botName: d.botName,
    status: d.status,
    url: d.url || null,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    configHash: d.configHash || null,
    lastBuiltHash: d.lastBuiltHash || null,
    ragMode: d.ragMode,
    embeddingChunkCount: d.embeddingChunkCount,
    cloud: d.cloudProvider
      ? {
          provider: d.cloudProvider,
          status: d.cloudStatus,
          url: d.cloudUrl,
          appName: d.cloudAppName,
          lastDeployedAt: d.cloudLastDeployedAt ? d.cloudLastDeployedAt.toISOString() : null,
        }
      : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

async function listDeploymentsHandler(input, _ctx) {
  const { status, mode, limit = 50, offset = 0 } = input || {};
  const all = await DeploymentRepository.list();
  let filtered = all;
  if (status) {
    filtered = filtered.filter((d) => d.status === status);
  }
  if (mode === 'cloud') {
    filtered = filtered.filter((d) => !!d.cloudProvider);
  } else if (mode === 'local') {
    filtered = filtered.filter((d) => !d.cloudProvider);
  }
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(summarizeDeployment);
  return { total, limit, offset, deployments: page };
}

async function getDeploymentHandler(input, _ctx) {
  const { id } = input || {};
  if (!id) throw new Error('id is required');
  const dep = await DeploymentRepository.findById(id);
  if (!dep) throw new Error(`Deployment not found: ${id}`);
  const summary = summarizeDeployment(dep);
  return {
    ...summary,
    config: dep.config,
    botSummary: dep.config?.botSummary || null,
    documentIds: dep.documentIds,
  };
}

async function loadConnectedDeployment(id) {
  if (!id) throw new Error('id is required');
  const dep = await DeploymentRepository.findById(id);
  if (!dep) throw new Error(`Deployment not found: ${id}`);
  if (!dep.url) throw new Error(`Deployment ${id} has no URL — bot is not connected`);
  return dep;
}

async function proxyJson(dep, path) {
  let response;
  try {
    response = await fetchFromBot(dep, path);
  } catch (err) {
    throw new Error(`Could not reach bot: ${err.message || err.name}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Bot returned ${response.status}: ${text.slice(0, 200)}`
    );
  }
  await DeploymentRepository.touchLastSeen(dep.id).catch(() => {});
  return response.json();
}

async function queryConversationsHandler(input, _ctx) {
  const { id, limit, offset, since, until, search } = input || {};
  const dep = await loadConnectedDeployment(id);
  const qs = new URLSearchParams();
  if (limit != null) qs.set('limit', String(limit));
  if (offset != null) qs.set('offset', String(offset));
  if (since) qs.set('since', String(since));
  if (until) qs.set('until', String(until));
  if (search) qs.set('search', String(search));
  const path = `/api/conversations${qs.toString() ? `?${qs.toString()}` : ''}`;
  const data = await proxyJson(dep, path);
  return { botName: dep.botName, ...data };
}

async function getConversationHandler(input, _ctx) {
  const { id, conversationId } = input || {};
  if (!conversationId) throw new Error('conversationId is required');
  const dep = await loadConnectedDeployment(id);
  return proxyJson(dep, `/api/conversations/${encodeURIComponent(conversationId)}`);
}

async function querySubmissionsHandler(input, _ctx) {
  const { id, limit, offset, since, until } = input || {};
  const dep = await loadConnectedDeployment(id);
  const qs = new URLSearchParams();
  if (limit != null) qs.set('limit', String(limit));
  if (offset != null) qs.set('offset', String(offset));
  if (since) qs.set('since', String(since));
  if (until) qs.set('until', String(until));
  const path = `/api/forms${qs.toString() ? `?${qs.toString()}` : ''}`;
  const data = await proxyJson(dep, path);
  return { botName: dep.botName, ...data };
}

async function verifyChainHandler(input, _ctx) {
  const { id, conversationId } = input || {};
  if (!conversationId) throw new Error('conversationId is required');
  const dep = await loadConnectedDeployment(id);
  return proxyJson(dep, `/verify/${encodeURIComponent(conversationId)}`);
}

export function registerOperateTools() {
  // Deployment metadata — always available. No transcript data, just rows
  // from the control plane's deployments table.
  registerTool({
    name: 'list_deployments',
    description:
      'List bots known to the control plane. Returns id, name, status, URL, connection state, and cloud metadata. Filter by status (saved | building | ready | stale | build_failed) or mode (local | cloud).',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by deployment status.' },
        mode: { type: 'string', enum: ['local', 'cloud'], description: 'Filter by local-only or cloud-deployed bots.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        offset: { type: 'integer', minimum: 0, default: 0 },
      },
    },
    handler: listDeploymentsHandler,
  });

  registerTool({
    name: 'get_deployment',
    description:
      'Get the full deployment row for one bot: identity, enabled protocols, generated configs, document ids, and cloud state. Reads from the control plane SQLite only — no proxy to the bot.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deployment id.' },
      },
      required: ['id'],
    },
    handler: getDeploymentHandler,
  });

  // Transcript-touching tools: gated behind MCP_EXPOSE_CONVERSATIONS=1. The
  // proxy reads keep conversation data inside the bot's SQLite; the model
  // sees them only because the user opted in to surfacing them.
  if (process.env.MCP_EXPOSE_CONVERSATIONS === '1') {
    registerTool({
      name: 'query_conversations',
      description:
        'List conversations on a connected bot. Proxies through to the bot — conversation rows live in the bot SQLite, never the control plane. Supports limit / offset / since / until / search.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deployment id.' },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
          offset: { type: 'integer', minimum: 0 },
          since: { type: 'string', description: 'ISO timestamp lower bound.' },
          until: { type: 'string', description: 'ISO timestamp upper bound.' },
          search: { type: 'string', description: 'Free-text search.' },
        },
        required: ['id'],
      },
      handler: queryConversationsHandler,
    });

    registerTool({
      name: 'get_conversation',
      description:
        'Get the full turn list for one conversation on a connected bot. Proxies through to the bot.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deployment id.' },
          conversationId: { type: 'string', description: 'Conversation id on the bot.' },
        },
        required: ['id', 'conversationId'],
      },
      handler: getConversationHandler,
    });

    registerTool({
      name: 'query_submissions',
      description:
        'List form-gathering submissions on a connected bot. Proxies through to the bot.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deployment id.' },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
          offset: { type: 'integer', minimum: 0 },
          since: { type: 'string' },
          until: { type: 'string' },
        },
        required: ['id'],
      },
      handler: querySubmissionsHandler,
    });

    registerTool({
      name: 'verify_chain',
      description:
        'Walk the tamper-evident hash chain for one conversation. Returns the verification result from the bot. See docs/turn-hashing.md for the chain semantics.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Deployment id.' },
          conversationId: { type: 'string', description: 'Conversation id on the bot.' },
        },
        required: ['id', 'conversationId'],
      },
      handler: verifyChainHandler,
    });
  }
}
