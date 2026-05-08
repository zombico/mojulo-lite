'use client';

import { useTranslations } from 'next-intl';
import { LLM_PROVIDERS } from '@/lib/llm-providers';

export default function LLMProviderSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  providerError,
  modelError
}) {
  const t = useTranslations('wizard.resources');

  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    onProviderChange(newProvider);

    // Auto-select default model for the new provider
    if (newProvider && LLM_PROVIDERS[newProvider]) {
      onModelChange(LLM_PROVIDERS[newProvider].defaultModel);
    }
  };

  const availableModels = provider && LLM_PROVIDERS[provider]
    ? LLM_PROVIDERS[provider].models
    : [];

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div>
        <label htmlFor="provider" className="block text-sm font-medium text-gray-300 mb-1">
          {t('provider')} <span className="text-red-400">*</span>
        </label>
        <select
          id="provider"
          value={provider}
          onChange={handleProviderChange}
          className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
            providerError ? 'border-red-500' : 'border-gray-600'
          }`}
        >
          <option value="">{t('selectProvider')}</option>
          {Object.entries(LLM_PROVIDERS).map(([key, config]) => (
            <option key={key} value={key}>
              {config.name}
            </option>
          ))}
        </select>
        {providerError && (
          <p className="mt-1 text-sm text-red-400">{providerError}</p>
        )}
      </div>

      {/* Model Selection */}
      {provider && (
        <div>
          <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-1">
            {t('model')} <span className="text-red-400">*</span>
          </label>
          <select
            id="model"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
              modelError ? 'border-red-500' : 'border-gray-600'
            }`}
          >
            <option value="">{t('selectModel')}</option>
            {availableModels.map((modelItem) => {
              // Handle both string models and object models (like Bedrock)
              const modelId = typeof modelItem === 'string' ? modelItem : modelItem.id;
              const modelName = typeof modelItem === 'string' ? modelItem : modelItem.name;
              return (
                <option key={modelId} value={modelId}>
                  {modelName}
                </option>
              );
            })}
          </select>
          {modelError && (
            <p className="mt-1 text-sm text-red-400">{modelError}</p>
          )}
        </div>
      )}
    </div>
  );
}
