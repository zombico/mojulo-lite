/**
 * Lazy BuilderSession binding for MCP connections.
 *
 * The web chat-builder threads a `session_id` through every tool call;
 * MCP doesn't have an analogous primitive that's load-bearing for our flow.
 * Instead, we bind one BuilderSession per `mcp-session-id` header value,
 * creating it on first build-tool invocation and reusing across calls.
 *
 * On reconnect / restart, in-memory map is lost; the user's Claude effectively
 * starts a new bot. Mirrors the web flow's "tab closed = session orphaned"
 * behavior. See plan section 9 for the upgrade path (persist + resume).
 */

import { BuilderSessionRepository } from '@/lib/db/repositories/builderSessions';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';
import { getDefaultModelForTask } from '@/lib/llm-providers';

const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-6';

// The api_keys table mixes LLM provider keys with cloud-deploy provider keys
// (Fly.io's API token lives under provider='fly'; see lib/deployers/cloud-deploy.js).
// When picking a *default LLM* we must filter to providers the chat / builder
// LLM call sites actually handle — otherwise generate_form_schema and friends
// throw "Unsupported provider: fly".
const LLM_PROVIDERS = new Set(['anthropic', 'openai', 'ollama']);

// mcpSessionId → BuilderSession.id
const bindings = new Map();

/**
 * Mirror of the web flow's buildPreloadedContext (api/builder/stream/route.js).
 * Loaded onto every fresh BuilderSession so tool executors can read the
 * default provider, API key, and workspace docs.
 */
async function buildPreloadedContext(userId) {
  const [documents, apiKeys] = await Promise.all([
    DocumentRepository.findByBotSpaceId(null),
    ApiKeyRepository.findByUserId(userId),
  ]);

  const existingBots = await DeploymentRepository.list();

  const llmKeys = apiKeys.filter((k) => LLM_PROVIDERS.has(k.provider));

  let defaultProvider;
  let defaultModel;
  let defaultApiKeyId;
  const defaultKey = llmKeys.find((k) => k.isDefault) || llmKeys[0];
  if (defaultKey) {
    defaultProvider = defaultKey.provider;
    defaultModel = getDefaultModelForTask(defaultKey.provider, 'reasoning');
    defaultApiKeyId = defaultKey.id;
  } else {
    defaultProvider = 'anthropic';
    defaultModel = ANTHROPIC_DEFAULT_MODEL;
  }

  return {
    organizationName: 'Local',
    workspaceName: 'Mojulo-Lite',
    workspaceDocuments: documents.map((d) => ({
      id: d.id,
      name: d.originalName,
      mimeType: d.mimeType,
    })),
    existingBots: existingBots
      .filter((d) => d.status === 'ready' && d.url)
      .map((d) => ({
        botName: d.botName,
        id: d.id,
        url: d.url,
        botSummary: d.config?.botSummary || null,
      })),
    defaultProvider,
    defaultModel,
    defaultApiKeyId,
    apiKeys: apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      provider: k.provider,
    })),
    disableModuloAnimation: true,
  };
}

/**
 * Get or create the BuilderSession for this MCP connection. Always refreshes
 * the session row from SQLite so tool handlers see writes from prior tool
 * calls in the same connection.
 */
export async function getOrCreateBuilderSession(mcpSessionId, userId) {
  const existingId = bindings.get(mcpSessionId);
  if (existingId) {
    const session = await BuilderSessionRepository.findById(existingId);
    if (session) return session;
    bindings.delete(mcpSessionId);
  }

  const apiKeys = await ApiKeyRepository.findByUserId(userId);
  const hasLlmKey = apiKeys.some((k) => LLM_PROVIDERS.has(k.provider));
  if (!hasLlmKey) {
    throw new Error(
      'No LLM provider key configured on the control plane. Add an Anthropic / OpenAI / Ollama key at /settings before using the MCP build tools. (Cloud-deploy tokens like Fly do not count.)'
    );
  }

  const preloadedContext = await buildPreloadedContext(userId);
  const session = await BuilderSessionRepository.createWithContext({
    userId,
    botSpaceId: null,
    preloadedContext,
  });
  bindings.set(mcpSessionId, session.id);
  return session;
}

/**
 * Force a new BuilderSession on the next build-tool call. Used by the
 * `start_new_bot` MCP tool so the user's Claude can build a second bot in
 * the same MCP connection without restarting the client.
 */
export function resetBuilderSession(mcpSessionId) {
  bindings.delete(mcpSessionId);
}

export function getBoundSessionId(mcpSessionId) {
  return bindings.get(mcpSessionId) || null;
}
