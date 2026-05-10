/**
 * Composer Bridge for Builder Flow
 *
 * Bridges builder session data to the lib/composer system for instruction composition.
 */

import { composeInstructions, getEnabledProtocolNames } from '../composer/composer.js';
import { buildResponseFormatSection } from '../composer/response-builder.js';

/**
 * Compose instructions from a builder session
 *
 * @param {Object} session - The builder session object
 * @returns {Promise<{ instructions: string, responseFormat: string, protocolsIncluded: string[] }>}
 */
export async function composeFromSession(session) {
  const { enabledProtocols, identityConfig, protocolData } = session;

  // Build protocol data object for composer
  const composerProtocolData = {};

  if (enabledProtocols.formGathering && protocolData.formGathering) {
    composerProtocolData.formStructure = protocolData.formGathering.generatedFormJson;
  }

  if (enabledProtocols.appointments && protocolData.appointments) {
    composerProtocolData.appointments = protocolData.appointments.destinations;
  }

  if (enabledProtocols.triage && protocolData.triage) {
    composerProtocolData.triage = protocolData.triage.routes;
  }

  // Optical Read: tool executor stores fields under generatedConfigs.opticalRead.
  // Honor protocolData first for symmetry with the wizard-side path, then fall
  // back to generatedConfigs for the chat-builder path.
  if (enabledProtocols.opticalRead) {
    const fields =
      protocolData.opticalRead?.fields ||
      session.generatedConfigs?.opticalRead?.fields ||
      [];
    if (fields.length > 0) {
      composerProtocolData.opticalRead = { fields };
    }
  }

  // Call composer
  const instructions = await composeInstructions({
    objective: identityConfig?.objective || '',
    enabledProtocols,
    protocolData: composerProtocolData,
  });

  // Build response format (already included in instructions, but provide separately for reference)
  const responseFormat = await buildResponseFormatSection(enabledProtocols);

  // Get list of included protocols
  const protocolsIncluded = getEnabledProtocolNames(enabledProtocols);

  return {
    instructions,
    responseFormat,
    protocolsIncluded,
  };
}

/**
 * Preview composition without caching
 *
 * @param {Object} session - The modular session object
 * @returns {Promise<Object>} - Composition preview with instructions and metadata
 */
export async function previewComposition(session) {
  const result = await composeFromSession(session);

  return {
    ...result,
    isCached: false,
    previewedAt: new Date().toISOString(),
    sessionId: session.id,
  };
}
