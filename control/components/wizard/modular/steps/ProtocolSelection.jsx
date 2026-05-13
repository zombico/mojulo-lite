'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import { providerSupportsVision, getAllowedProtocolsForModel } from '@/lib/llm-providers';

const PROTOCOL_ICONS = {
  knowledge: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  formGathering: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  appointments: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  triage: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  opticalRead: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function useProtocolCards(t, { provider, model } = {}) {
  // Model-level gate: small Ollama models (qwen3, mistral-nemo) are only
  // reliable at single-turn knowledge Q&A. Returns null for unrestricted
  // (provider, model) pairs — knowledge stays available either way.
  const allowedProtocols = getAllowedProtocolsForModel(provider, model);
  const isModelRestricted = (id) =>
    !!allowedProtocols && !allowedProtocols.has(id);
  const modelGateReason = t('modelGate');

  return [
    {
      id: 'knowledge',
      title: t('knowledgeBase'),
      description: t('knowledgeBaseDescription'),
      icon: PROTOCOL_ICONS.knowledge,
    },
    {
      id: 'formGathering',
      title: t('formCollection'),
      description: t('formCollectionDescription'),
      icon: PROTOCOL_ICONS.formGathering,
      disabled: isModelRestricted('formGathering'),
      disabledReason: modelGateReason,
    },
    {
      id: 'appointments',
      title: t('appointmentBooking'),
      description: t('appointmentBookingDescription'),
      icon: PROTOCOL_ICONS.appointments,
      disabled: isModelRestricted('appointments'),
      disabledReason: modelGateReason,
    },
    {
      id: 'triage',
      title: t('triageRouting'),
      description: t('triageRoutingDescription'),
      icon: PROTOCOL_ICONS.triage,
      disabled: isModelRestricted('triage'),
      disabledReason: modelGateReason,
    },
    {
      id: 'opticalRead',
      title: t('opticalRead'),
      description: t('opticalReadDescription'),
      icon: PROTOCOL_ICONS.opticalRead,
      // Two independent gates: vision capability (provider-level) and the
      // small-Ollama-model restriction. Either can disable the card; the
      // model gate wins the reason text when both apply, since it's the
      // narrower constraint the user can act on (switch model vs. switch
      // provider). Keep VISION_PROVIDERS aligned with the adapters in
      // lite-template/helper/llm-client.js.
      disabled:
        isModelRestricted('opticalRead') ||
        (!!provider && !providerSupportsVision(provider)),
      disabledReason: isModelRestricted('opticalRead')
        ? modelGateReason
        : t('opticalReadProviderGate'),
    },
  ];
}

function ProtocolCard({ protocol, enabled, onToggle }) {
  const disabled = !!protocol.disabled;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      title={disabled ? protocol.disabledReason : undefined}
      className={`
        w-full text-left p-3 rounded-lg border-2 transition-all group
        ${disabled
          ? 'border-gray-800 bg-gray-900 opacity-50 cursor-not-allowed'
          : enabled
            ? 'border-teal-500 bg-teal-900/30 shadow-sm'
            : 'border-gray-700 bg-gray-800 hover:border-gray-600 hover:bg-gray-700'
        }
      `}
    >
      <div className="flex items-center gap-3">
        {/* Toggle indicator */}
        <div className={`
          flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center
          ${enabled && !disabled ? 'border-teal-500 bg-teal-500' : 'border-gray-600 group-hover:border-gray-500'}
        `}>
          {enabled && !disabled && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        {/* Icon */}
        <span className={enabled && !disabled ? 'text-teal-400' : 'text-gray-500 group-hover:text-gray-400'}>
          {protocol.icon}
        </span>

        {/* Title & Description */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-100">
            {protocol.title}
          </h3>
          {(!enabled || disabled) && (
            <p className="text-sm text-gray-500">
              {disabled ? protocol.disabledReason : protocol.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ProtocolSelection({ stepConfig }) {
  const t = useTranslations('wizard.protocols');
  const { enabledProtocols, toggleProtocol, errors, clearError, formData } = useModularWizard();
  const protocolCards = useProtocolCards(t, {
    provider: formData.provider,
    model: formData.model,
  });

  const hasAnyProtocol = enabledProtocols.knowledge ||
                         enabledProtocols.formGathering ||
                         enabledProtocols.appointments ||
                         enabledProtocols.triage ||
                         enabledProtocols.opticalRead;

  const handleToggle = (protocolId) => {
    toggleProtocol(protocolId);
    if (errors.protocols) {
      clearError('protocols');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-100 mb-2">
          {stepConfig?.title || t('selectCapabilities')}
        </h2>
        <p className="text-gray-400">
          {t('selectCapabilitiesDescription')}
        </p>
      </div>

      {/* Protocol Cards */}
      <div className="space-y-3">
        {protocolCards.map((protocol) => {
          const isEnabled = enabledProtocols[protocol.id];

          return (
            <ProtocolCard
              key={protocol.id}
              protocol={protocol}
              enabled={isEnabled}
              onToggle={() => handleToggle(protocol.id)}
            />
          );
        })}
      </div>

      {/* Error/warning display - only shown when there's an issue */}
      {(errors.protocols || !hasAnyProtocol) && (
        <div className="mt-auto p-3 bg-amber-900/30 border border-amber-800 rounded-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-amber-300 font-medium text-sm">
            {errors.protocols || t('selectAtLeastOne')}
          </span>
        </div>
      )}
    </div>
  );
}
