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
 * or no API key) so the preview can show a setup hint instead of booting
 * a half-configured bot.
 */
export function buildPreviewConfig(formData, enabledProtocols) {
  if (!formData?.provider || !formData?.apiKey || !formData?.model) {
    return null;
  }

  const llm = buildLLMConfig(formData.provider, formData.apiKey, formData.model, {
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
    },
    ragSummary: formData.ragSummary || '',
    llm,
    documentIds: (formData.documents || []).map((d) => d.id),
    ragMode: formData.ragMode || 'keyword',
    embeddingsStorageKey: formData.embeddings?.storageKey || null,
  };

  return { botContext, previewMeta };
}
