/**
 * Map the wizard's in-progress formData into the shape the bot's client
 * (lite-template/client/index.html) expects from a deployed container's
 * `/context` endpoint. This is what the preview iframe reads via
 * `window.__INITIAL_CONFIG__`.
 *
 * Production source of truth: mojulo-lite/lite-template/server.js — the
 * `/` route (line ~186) and `/context` route (line ~963) build the same
 * object from on-disk config files. We mirror that shape here, but pulled
 * from React state instead.
 */

import { buildLLMConfig } from '@/lib/config-builder';

function safeParseFormJson(json) {
  if (!json) return null;
  try {
    return typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
}

/**
 * Build the `botContext` payload from wizard formData + enabledProtocols.
 * Returns null if the bare-minimum LLM config isn't ready yet (no provider
 * or no credential) so the preview can show a setup hint instead of booting
 * a half-configured bot.
 *
 * Credential can come in three shapes:
 *   - formData.apiKey         pasted plaintext (rides in the llm block)
 *   - formData.apiKeyId       saved-key reference (decrypted server-side at
 *                             /api/preview/chat — mirrors the deploy path)
 *   - formData.hasStoredApiKey + formData.editDeploymentId
 *                             edit mode reusing the existing on-file key:
 *                             the chat route looks it up from the deployment
 *                             row server-side. The browser never sees the
 *                             plaintext.
 */
export function buildPreviewConfig(formData, enabledProtocols) {
  const hasCredential = Boolean(
    formData?.apiKey ||
      formData?.apiKeyId ||
      (formData?.hasStoredApiKey && formData?.editDeploymentId),
  );
  if (!formData?.provider || !hasCredential || !formData?.model) {
    return null;
  }

  const llm = buildLLMConfig(formData.provider, formData.apiKey || '', formData.model, {
    maxTokens: 2048,
  });

  const formStructure = enabledProtocols.formGathering
    ? safeParseFormJson(formData.generatedFormJson)
    : null;

  const botContext = {
    name: formData.botName || 'Preview Bot',
    chatDisplayName:
      formData.uiSettings?.chatDisplayName || formData.chatDisplayName || 'Bot',
    placeholder:
      formData.uiSettings?.placeholder ||
      formData.placeholder ||
      'Type your message...',
    firstMessage:
      formData.firstMessage || 'Hello! How can I help you today?',
    suggestedPrompts: formData.suggestedPrompts || [],

    isForm: Boolean(enabledProtocols.formGathering && formStructure),
    formStructure: formStructure || undefined,
    formCompletionWebhook: formData.formCompletionWebhook || '',
    afterSubmitChatMessage: formData.afterSubmitChatMessage || '',
    formSendHome: Boolean(formData.formSendHome),
    termsAndConditions: formData.termsAndConditions || '',

    isCalendar: Boolean(
      enabledProtocols.appointments &&
        formData.appointmentDestinations?.length > 0,
    ),
    calendarConfig: enabledProtocols.appointments
      ? formData.appointmentDestinations || []
      : [],

    isTriage: Boolean(
      enabledProtocols.triage && formData.triageRoutes?.length > 0,
    ),
    triageRoutes: enabledProtocols.triage ? formData.triageRoutes || [] : [],

    isOpticalRead: Boolean(
      enabledProtocols.opticalRead && formData.opticalReadFields?.length > 0,
    ),
    opticalReadFields: enabledProtocols.opticalRead
      ? formData.opticalReadFields || []
      : [],
    opticalReadShowUploadOnStart: Boolean(
      enabledProtocols.opticalRead && formData.opticalReadShowUploadOnStart,
    ),
  };

  // The shim uses these to translate /chat calls into /api/preview/chat
  // calls. They aren't part of the deployed bot's /context shape — they
  // ride along as `__previewMeta` so the production client never sees them.
  const previewMeta = {
    objective:
      formData.objective || `Help users as ${formData.botName || 'a bot'}.`,
    enabledProtocols,
    protocolData: {
      ...(formStructure ? { formStructure } : {}),
      ...(enabledProtocols.appointments
        ? { appointments: formData.appointmentDestinations || [] }
        : {}),
      ...(enabledProtocols.triage
        ? { triage: formData.triageRoutes || [] }
        : {}),
      ...(enabledProtocols.opticalRead
        ? { opticalRead: { fields: formData.opticalReadFields || [] } }
        : {}),
    },
    llm,
    apiKeyId: formData.apiKeyId || null,
    editDeploymentId: formData.editDeploymentId || null,
    documentIds: (formData.documents || []).map((d) => d.id),
    embeddingsStorageKey: formData.embeddings?.storageKey || null,
  };

  return { botContext, previewMeta };
}
