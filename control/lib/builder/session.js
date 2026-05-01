/**
 * Session Manager for Builder Flow
 *
 * High-level session management functions that orchestrate
 * repository operations and business logic.
 */

import { BuilderSessionRepository } from '../db/repositories/builderSessions.js';
import { composeFromSession } from './composer-bridge.js';
import { validateSessionForDeployment, PROTOCOL_VALIDATORS } from './validators.js';

/**
 * Create a new builder session
 * @param {string|null} orgId - Organization ID (optional)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Created session
 */
export async function createBuilderSession(orgId, userId) {
  return BuilderSessionRepository.create({ userId });
}

/**
 * Get session with access check
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Session object
 * @throws {Error} If session not found or access denied
 */
export async function getBuilderSession(sessionId, userId) {
  const session = await BuilderSessionRepository.findByIdAndUserId(sessionId, userId);
  if (!session) {
    throw new Error('Session not found or access denied');
  }
  return session;
}

/**
 * Toggle protocol and regenerate step flow
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {string} protocol - Protocol name
 * @param {boolean} enabled - Enable or disable
 * @returns {Promise<{ session: Object, steps: Array }>}
 */
export async function toggleProtocol(sessionId, userId, protocol, enabled) {
  const session = await getBuilderSession(sessionId, userId);

  const enabledProtocols = {
    ...session.enabledProtocols,
    [protocol]: enabled,
  };

  const updatedSession = await BuilderSessionRepository.updateProtocols(
    sessionId,
    userId,
    enabledProtocols
  );

  // Return updated session with regenerated step list
  return {
    session: updatedSession,
    steps: generateStepFlow(updatedSession.enabledProtocols),
  };
}

/**
 * Generate step flow based on enabled protocols
 * @param {Object} enabledProtocols - Protocol toggles
 * @returns {Array} Array of step objects
 */
export function generateStepFlow(enabledProtocols) {
  const steps = [
    { id: 'core', number: 1, section: 'Bot Setup', required: true },
    { id: 'protocols', number: 2, section: 'Capabilities', required: true },
    { id: 'identity', number: 3, section: 'Identity', required: true },
  ];

  let stepNumber = 4;

  if (enabledProtocols.knowledge) {
    steps.push({
      id: 'knowledge',
      number: stepNumber++,
      section: 'Knowledge Base',
      protocol: 'knowledge',
    });
  }

  if (enabledProtocols.formGathering) {
    steps.push({
      id: 'formGathering',
      number: stepNumber++,
      section: 'Form Collection',
      protocol: 'formGathering',
    });
  }

  if (enabledProtocols.appointments) {
    steps.push({
      id: 'appointments',
      number: stepNumber++,
      section: 'Appointments',
      protocol: 'appointments',
    });
  }

  steps.push({
    id: 'deploy',
    number: stepNumber,
    section: 'Deploy',
    required: true,
  });

  return steps;
}

/**
 * Save core configuration
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} config - Core configuration
 * @returns {Promise<Object>} Updated session
 */
export async function saveCoreConfig(sessionId, userId, config) {
  await getBuilderSession(sessionId, userId); // Access check

  const updatedSession = await BuilderSessionRepository.updateCoreConfig(
    sessionId,
    userId,
    config
  );

  // Mark step as completed
  await BuilderSessionRepository.updateStepProgress(sessionId, userId, 'core', 'completed');

  return updatedSession;
}

/**
 * Save identity configuration
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {Object} config - Identity configuration
 * @returns {Promise<Object>} Updated session
 */
export async function saveIdentityConfig(sessionId, userId, config) {
  await getBuilderSession(sessionId, userId); // Access check

  const updatedSession = await BuilderSessionRepository.updateIdentityConfig(
    sessionId,
    userId,
    config
  );

  await BuilderSessionRepository.updateStepProgress(sessionId, userId, 'identity', 'completed');

  return updatedSession;
}

/**
 * Save protocol-specific configuration
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {string} protocol - Protocol name
 * @param {Object} data - Protocol data
 * @returns {Promise<Object>} Updated session
 */
export async function saveProtocolConfig(sessionId, userId, protocol, data) {
  const session = await getBuilderSession(sessionId, userId);

  // Validate protocol data
  if (PROTOCOL_VALIDATORS[protocol]) {
    const validation = PROTOCOL_VALIDATORS[protocol](data);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  const updatedSession = await BuilderSessionRepository.updateProtocolData(
    sessionId,
    userId,
    protocol,
    data
  );

  // Mark protocol step as completed
  await BuilderSessionRepository.updateStepProgress(sessionId, userId, protocol, 'completed');

  return updatedSession;
}

/**
 * Compose instructions and cache them
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<{ instructions: string, responseFormat: string, protocolsIncluded: string[], cached: boolean }>}
 */
export async function composeAndCache(sessionId, userId) {
  const session = await getBuilderSession(sessionId, userId);

  // Check if cached instructions are still valid
  if (session.composedInstructions) {
    return {
      instructions: session.composedInstructions,
      responseFormat: session.responseFormat,
      cached: true,
    };
  }

  // Compose new instructions
  const { instructions, responseFormat, protocolsIncluded } = await composeFromSession(session);

  // Cache them
  await BuilderSessionRepository.cacheComposedInstructions(
    sessionId,
    userId,
    instructions,
    responseFormat
  );

  return {
    instructions,
    responseFormat,
    protocolsIncluded,
    cached: false,
  };
}

/**
 * Validate session is ready for deployment
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export async function validateForDeployment(sessionId, userId) {
  const session = await getBuilderSession(sessionId, userId);
  return validateSessionForDeployment(session);
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteBuilderSession(sessionId, userId) {
  return BuilderSessionRepository.delete(sessionId, userId);
}
