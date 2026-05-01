/**
 * Builder Flow Entry Point
 *
 * Exports all builder functionality for the protocol-aware wizard system.
 * Supports both legacy step-card wizard and inverted flow ("Claude proposes, User disposes").
 */

// Session management (legacy wizard mode)
export {
  createBuilderSession,
  getBuilderSession,
  toggleProtocol,
  generateStepFlow,
  saveCoreConfig,
  saveIdentityConfig,
  saveProtocolConfig,
  composeAndCache,
  validateForDeployment,
  deleteBuilderSession,
} from './session.js';

// Composer bridge
export { composeFromSession, previewComposition } from './composer-bridge.js';

// Validators
export {
  PROTOCOL_VALIDATORS,
  validateCoreConfig,
  validateIdentityConfig,
  validateEnabledProtocols,
  validateSessionForDeployment,
} from './validators.js';

// Save executor (formerly the deployment executor — now writes to SQLite only;
// callers that want a built artifact must hit /api/deployments/[id]/build).
export { saveBuilderConfig } from './executor.js';

// Inverted flow tools
export { BUILDER_TOOLS, TOOL_LABELS, TOOL_ICONS, getToolByName, validateToolInput } from './tools.js';

// Inverted flow tool executors
export { executeBuilderTool, builderToolHandlers } from './tool-executors.js';

// Inverted flow system prompt
export { buildBuilderSystemPrompt } from './system-prompt.js';

// Smart intent evaluation
export { evaluateIntent, shouldSkipEvaluation } from './evaluator.js';
