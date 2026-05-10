/**
 * Builder Save Executor
 *
 * Persists a builder session as a deployment row in SQLite. Does NOT build
 * the ZIP artifact — that's a separate, on-demand step (see
 * `lib/deployers/build.js` and `POST /api/deployments/[id]/build`).
 *
 * The chat UI surfaces a "Build & Download" CTA after this returns.
 */

import { BuilderSessionRepository } from '../db/repositories/builderSessions.js';
import {
  DeploymentRepository,
  DEPLOYMENT_STATUS,
} from '../db/repositories/deployments.js';
import { DeploymentEventRepository } from '../db/repositories/deploymentEvents.js';
import { ApiKeyRepository } from '../db/repositories/apiKeys.js';
import { decryptApiKey, generateApiKey } from '../deployment-auth.js';
import { composeAndCache, getBuilderSession, validateForDeployment } from './session.js';
import { buildLLMConfig } from '../config-builder.js';

/**
 * Save a modular session as a deployment row.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {Object} options
 * @param {string} [options.botSpaceId]
 * @param {string} [options.redeploymentId] - If provided, update existing row
 * @returns {Promise<Object>}
 */
export async function saveBuilderConfig(sessionId, userId, options = {}) {
  const { botSpaceId, redeploymentId } = options;
  const isUpdate = !!redeploymentId;

  const session = await getBuilderSession(sessionId, userId);

  const validation = await validateForDeployment(sessionId, userId);
  if (!validation.valid) {
    throw new Error(`Session not ready to save: ${validation.errors.join(', ')}`);
  }

  const { instructions } = await composeAndCache(sessionId, userId);

  const apiKeyRecords = await ApiKeyRepository.findByUserId(userId);
  const apiKeyRecord = apiKeyRecords.find(
    (key) => key.provider === session.coreConfig.provider
  );
  if (!apiKeyRecord) {
    throw new Error(`No API key found for provider: ${session.coreConfig.provider}`);
  }
  const decryptedApiKey = decryptApiKey(apiKeyRecord.encryptedKey);

  const deploymentConfig = buildDeploymentConfig(session, instructions, decryptedApiKey);
  const documentIds = session.protocolData.knowledge?.documents?.map((d) => d.id) || [];
  const enabledProtocols = session.enabledProtocols;

  // All bots run vector retrieval. Knowledge protocol embeds documents;
  // triage protocol embeds route descriptions; both end up in the same
  // single cosine index. A bot with neither protocol simply has no
  // embeddings — RAG is silently disabled at runtime in that case.
  const ragMode = 'vector';
  const embeddings = session.generatedConfigs?.embeddings || null;
  if (enabledProtocols.knowledge && !embeddings?.storageKey) {
    throw new Error(
      'Knowledge protocol is enabled but no embeddings were produced. Run process_documents first.'
    );
  }
  if (enabledProtocols.triage && !embeddings?.storageKey) {
    throw new Error(
      'Triage protocol is enabled but no embeddings were produced. Run generate_triage_config first.'
    );
  }

  let deployment;
  let deploymentApiKey;

  if (isUpdate) {
    const existing = await DeploymentRepository.findById(redeploymentId);
    if (!existing) {
      throw new Error(`Deployment ${redeploymentId} not found`);
    }
    if (existing.userId && existing.userId !== userId) {
      throw new Error('Unauthorized to update this deployment');
    }

    deploymentApiKey = existing.apiKey;

    deployment = await DeploymentRepository.update(redeploymentId, {
      botName: session.coreConfig.botName,
      config: {
        ...deploymentConfig,
        _modular: {
          paradigm: 'modular',
          enabledProtocols,
          sessionId,
        },
      },
      documentIds,
      error: null,
    });
  } else {
    deploymentApiKey = generateApiKey();
    deployment = await DeploymentRepository.create({
      userId,
      botSpaceId: botSpaceId || null,
      botName: session.coreConfig.botName,
      flowType: 'modular',
      status: DEPLOYMENT_STATUS.SAVED,
      config: {
        ...deploymentConfig,
        _modular: {
          paradigm: 'modular',
          enabledProtocols,
          sessionId,
        },
      },
      documentIds,
      apiKey: deploymentApiKey,
    });
  }

  // Stamp embedding pointers onto the row. ragMode is always 'vector' now;
  // setRagMode is kept as a no-op write so legacy rows keep their schema.
  await DeploymentRepository.setRagMode(deployment.id, ragMode);
  if (embeddings?.storageKey) {
    await DeploymentRepository.setEmbeddings(deployment.id, {
      storageKey: embeddings.storageKey,
      model: embeddings.model,
      chunkCount: embeddings.chunkCount,
    });
  } else {
    await DeploymentRepository.clearEmbeddings(deployment.id);
  }
  // Re-fetch so the returned deployment reflects the embedding columns.
  deployment = await DeploymentRepository.findById(deployment.id);

  await BuilderSessionRepository.linkDeployment(sessionId, userId, deployment.id);
  await DeploymentEventRepository.create({
    deploymentId: deployment.id,
    userId,
    eventType: isUpdate ? 'updated' : 'created',
    status: deployment.status,
    config: deployment.config,
  });

  await BuilderSessionRepository.updateStepProgress(
    sessionId,
    userId,
    'deploy',
    'completed'
  );

  return {
    success: true,
    deploymentId: deployment.id,
    status: deployment.status,
    botName: session.coreConfig.botName,
    sessionId,
    isUpdate,
    buildUrl: `/api/deployments/${deployment.id}/build`,
    downloadUrl: `/api/deployments/${deployment.id}/download`,
  };
}

/**
 * Build deployment config from session data
 * Produces the nested structure expected by validateDeploymentConfig:
 * { config: {...}, llm: { provider, [provider]: {...} }, objective, ... }
 */
function buildDeploymentConfig(session, instructions, apiKey) {
  const { coreConfig, identityConfig, enabledProtocols, protocolData, generatedConfigs } = session;

  const provider = coreConfig.provider || 'anthropic';
  const model = coreConfig.model || 'claude-sonnet-4-20250514';

  const configSection = {
    instructions: './config/instructions.txt',
    name: coreConfig.botName,
    chatDisplayName: identityConfig.chatDisplayName || 'Bot',
    placeholder: 'Type your message...',
    firstMessage: identityConfig.firstMessage || `Welcome! I'm ${coreConfig.botName}. How can I help you?`,
    suggestedPrompts: (identityConfig.suggestedPrompts || []).map((prompt) =>
      typeof prompt === 'string' ? { suggestedPrompt: prompt } : prompt
    ),
    actionsBar: {
      showBar: false,
      showSourceButton: false,
      showMetadataButton: false,
      showCopyButton: false,
      showSuggestedPrompts: false,
    },
  };

  if (enabledProtocols.formGathering && protocolData.formGathering) {
    configSection.isForm = true;
    configSection.formStructure = './config/formFormat.json';
    if (protocolData.formGathering.formCompletionWebhook) {
      configSection.formCompletionWebhook = protocolData.formGathering.formCompletionWebhook;
    }
    configSection.afterSubmitChatMessage = protocolData.formGathering.afterSubmitChatMessage;
    if (protocolData.formGathering.formSendHome) {
      configSection.formSendHome = true;
    }
  }

  if (enabledProtocols.appointments && protocolData.appointments) {
    configSection.isCalendar = true;
    configSection.calendarConfig = './config/calendarConfig.json';
  }

  if (enabledProtocols.triage && protocolData.triage) {
    configSection.isTriage = true;
    configSection.triageRoutes = './config/triageRoutes.json';
  }

  // Optical Read: chat-builder writes opticalRead.fields onto generatedConfigs
  // (see generate_optical_read_config). Wire the artifact-side flag/path here
  // and surface the field list at top-level for build.js to pick up.
  const opticalReadFields = enabledProtocols.opticalRead
    ? generatedConfigs?.opticalRead?.fields || []
    : [];
  if (enabledProtocols.opticalRead && opticalReadFields.length > 0) {
    configSection.isOpticalRead = true;
    configSection.opticalReadFields = './config/opticalReadFields.json';
    // Default the upload-first entry point on for chat-builder output. The
    // chat builder doesn't expose a per-bot toggle; users can opt out by
    // editing the deployment in the wizard, which respects the saved value.
    configSection.opticalReadShowUploadOnStart = true;
  }

  return {
    config: configSection,
    llm: buildLLMConfig(provider, apiKey, model, {}),
    objective: identityConfig.objective,
    botSummary: generatedConfigs?.botSummary || '',
    formStructure: enabledProtocols.formGathering
      ? protocolData.formGathering?.generatedFormJson
      : undefined,
    formCompletionWebhook: protocolData.formGathering?.formCompletionWebhook || undefined,
    afterSubmitChatMessage: protocolData.formGathering?.afterSubmitChatMessage || undefined,
    formSendHome: protocolData.formGathering?.formSendHome || undefined,
    appointmentDestinations: enabledProtocols.appointments
      ? protocolData.appointments?.destinations
      : undefined,
    triageRoutes: enabledProtocols.triage ? protocolData.triage?.routes : undefined,
    opticalReadFields: enabledProtocols.opticalRead ? opticalReadFields : undefined,
    paradigm: 'modular',
    enabledProtocols,
    _composedInstructions: instructions,
  };
}
