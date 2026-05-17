/**
 * MCP Ring 1 — build tools.
 *
 * Each tool here is a thin wrapper around a handler in
 * [@/lib/builder/tool-executors](control/lib/builder/tool-executors.js).
 * The wrapper:
 *   1. Lazily binds a BuilderSession to the MCP connection (first call).
 *   2. Refreshes the session row so writes from prior tool calls are visible.
 *   3. Delegates to executeBuilderTool, surfaces success / error to MCP.
 *
 * Tool schemas are derived from BUILDER_TOOLS — single source of truth lives
 * in [@/lib/builder/tools](control/lib/builder/tools.js). The MCP `inputSchema`
 * is the same JSON Schema the web chat builder gives Claude, so the user's
 * Claude sees an identical tool surface.
 *
 * Phase 1 registers synchronous tools only. `process_documents` and
 * `save_modular_bot` are deferred to Phase 2 (job-based) because they can run
 * >2s and need a poll interface.
 */

import { BUILDER_TOOLS } from '@/lib/builder/tools';
import { executeBuilderTool } from '@/lib/builder/tool-executors';
import { BuilderSessionRepository } from '@/lib/db/repositories/builderSessions';
import {
  getOrCreateBuilderSession,
  resetBuilderSession,
} from '@/lib/mcp/session-binding';
import { registerTool } from '@/lib/mcp/server';

const SYNC_TOOL_NAMES = new Set([
  'infer_intent',
  'recommend_protocols',
  'generate_form_schema',
  'generate_appointment_config',
  'generate_triage_config',
  'generate_optical_read_config',
  'compose_identity',
  'set_suggested_prompts',
  'generate_bot_summary',
]);

function findBuilderToolSchema(name) {
  const tool = BUILDER_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`BUILDER_TOOLS is missing ${name}`);
  return tool;
}

/**
 * Build a context the existing tool executors expect: { session, userId }.
 * The session is re-fetched on every call to pick up writes from prior tool
 * invocations in the same MCP connection (each call mutates SQLite, but the
 * in-memory object would be stale otherwise).
 */
async function buildExecutorContext(mcpContext) {
  const session = await getOrCreateBuilderSession(
    mcpContext.mcpSessionId,
    mcpContext.userId
  );
  return { session, userId: mcpContext.userId };
}

function makeHandler(toolName) {
  return async function handle(input, mcpContext) {
    const ctx = await buildExecutorContext(mcpContext);
    const result = await executeBuilderTool(toolName, input, ctx);
    if (!result.success) {
      throw new Error(result.error || `${toolName} failed`);
    }
    return result.result;
  };
}

export function registerBuildTools() {
  for (const name of SYNC_TOOL_NAMES) {
    const schema = findBuilderToolSchema(name);
    registerTool({
      name: schema.name,
      description: schema.description,
      inputSchema: schema.input_schema,
      handler: makeHandler(name),
    });
  }

  // Ergonomic extra not in BUILDER_TOOLS — lets the user's Claude start over
  // without dropping the MCP connection. Mirrors closing/reopening the web
  // chat-builder tab.
  registerTool({
    name: 'start_new_bot',
    description:
      'Reset the builder session for this MCP connection so the next build tool call starts a fresh bot from scratch. Use when the user wants to build a second bot in the same session, or to discard in-progress configuration.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_input, mcpContext) => {
      resetBuilderSession(mcpContext.mcpSessionId);
      return { message: 'Builder session reset. The next build tool call will start a new bot.' };
    },
  });

  // Lets the user's Claude inspect the in-progress configuration without
  // peeking at the SQLite row directly. Read-only, no session mutation.
  registerTool({
    name: 'get_builder_session',
    description:
      'Return the current builder session state for this MCP connection — inferred intent, recommended protocols, identity, generated configs. Useful for the model to see what it has built so far before composing the final save.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_input, mcpContext) => {
      const session = await getOrCreateBuilderSession(
        mcpContext.mcpSessionId,
        mcpContext.userId
      );
      const fresh = await BuilderSessionRepository.findById(session.id);
      return {
        sessionId: fresh.id,
        status: fresh.status,
        inferredIntent: fresh.inferredIntent,
        intentConfidence: fresh.intentConfidence,
        recommendedProtocols: fresh.recommendedProtocols,
        enabledProtocols: fresh.enabledProtocols,
        generatedConfigs: fresh.generatedConfigs,
        deploymentId: fresh.deploymentId,
      };
    },
  });
}
