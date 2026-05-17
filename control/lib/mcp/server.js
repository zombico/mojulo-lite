/**
 * MCP server core — protocol dispatch and tool registry.
 *
 * The Next.js route ([api/mcp/route.js]) handles HTTP + bearer auth and
 * forwards parsed JSON-RPC messages here. This module owns the MCP
 * protocol semantics: initialize / tools/list / tools/call.
 *
 * Tools are registered in rings (see [tools/build.js], [tools/operate.js]).
 * Each registered tool has:
 *   - name, description, inputSchema (JSON Schema)
 *   - handler(input, context) → result | Promise<result>
 *
 * Execution context carries:
 *   - mcpSessionId — used by session-binding.js to attach a BuilderSession
 *   - userId — always 'local' (single-user posture, see auth/service.js)
 */

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'mojulo-control-plane';
const SERVER_VERSION = '0.1.0';

const registeredTools = new Map();

export function registerTool(tool) {
  if (!tool || !tool.name || typeof tool.handler !== 'function') {
    throw new Error('registerTool requires { name, handler }');
  }
  registeredTools.set(tool.name, tool);
}

export function listTools() {
  return Array.from(registeredTools.values()).map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
  }));
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

export async function dispatchMcpRequest(message, context) {
  if (!message || message.jsonrpc !== '2.0') {
    return jsonRpcError(message?.id ?? null, ErrorCodes.INVALID_REQUEST, 'Invalid JSON-RPC request');
  }

  // Notifications (no id) — we accept and return nothing.
  const isNotification = message.id === undefined || message.id === null;

  try {
    switch (message.method) {
      case 'initialize':
        return isNotification
          ? null
          : jsonRpcResult(message.id, {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {
                tools: { listChanged: false },
              },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            });

      case 'notifications/initialized':
      case 'initialized':
        return null;

      case 'ping':
        return isNotification ? null : jsonRpcResult(message.id, {});

      case 'tools/list':
        return jsonRpcResult(message.id, { tools: listTools() });

      case 'tools/call':
        return await handleToolCall(message, context);

      default:
        if (isNotification) return null;
        return jsonRpcError(
          message.id,
          ErrorCodes.METHOD_NOT_FOUND,
          `Method not found: ${message.method}`
        );
    }
  } catch (err) {
    console.error('[mcp] dispatch error:', err);
    if (isNotification) return null;
    return jsonRpcError(
      message.id,
      ErrorCodes.INTERNAL_ERROR,
      err.message || 'Internal error'
    );
  }
}

async function handleToolCall(message, context) {
  const params = message.params || {};
  const toolName = params.name;
  const toolInput = params.arguments || {};

  const tool = registeredTools.get(toolName);
  if (!tool) {
    return jsonRpcError(
      message.id,
      ErrorCodes.METHOD_NOT_FOUND,
      `Unknown tool: ${toolName}`
    );
  }

  try {
    const result = await tool.handler(toolInput, context);
    return jsonRpcResult(message.id, toMcpToolResult(result));
  } catch (err) {
    // Per MCP spec, tool execution failures are returned as a tool_result
    // with isError: true rather than a JSON-RPC error — so the client model
    // can see the failure and react.
    return jsonRpcResult(message.id, {
      content: [{ type: 'text', text: err.message || 'Tool execution failed' }],
      isError: true,
    });
  }
}

function toMcpToolResult(result) {
  if (result && typeof result === 'object' && Array.isArray(result.content)) {
    // Tool already returned MCP-shaped content; trust it.
    return result;
  }
  const text =
    typeof result === 'string' ? result : JSON.stringify(result ?? {}, null, 2);
  return { content: [{ type: 'text', text }] };
}

// Tool registrations run on first request rather than at module load. We use
// dynamic import to avoid a circular dependency: tool modules import
// `registerTool` from this file.
let _registered = false;
export async function ensureToolsRegistered() {
  if (_registered) return;
  _registered = true;
  const { registerBuildTools } = await import('@/lib/mcp/tools/build');
  const { registerJobsTools } = await import('@/lib/mcp/tools/jobs-tools');
  const { registerOperateTools } = await import('@/lib/mcp/tools/operate');
  registerBuildTools();
  registerJobsTools();
  registerOperateTools();
}
