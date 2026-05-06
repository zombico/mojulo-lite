'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import LLMProviderSelector from '../../../shared/LLMProviderSelector';
import APIKeySelector from '../../../shared/APIKeySelector';

export default function CoreSetup({ stepConfig, isEditMode = false }) {
  const { formData, updateFormData, errors, clearError } = useModularWizard();
  const t = useTranslations('wizard.resources');

  const handleProviderChange = (provider) => {
    updateFormData({ provider });
    clearError('provider');
  };

  const handleModelChange = (model) => {
    updateFormData({ model });
    clearError('model');
  };

  const handleApiKeyChange = (apiKey) => {
    updateFormData({ apiKey });
    clearError('apiKey');
  };

  const handleApiKeyIdChange = (apiKeyId) => {
    updateFormData({ apiKeyId });
    clearError('apiKey');
  };

  const handleBotNameChange = (e) => {
    updateFormData({ botName: e.target.value });
    clearError('botName');
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">
        {/* Resource Name - Hidden in edit mode */}
        {!isEditMode && (
          <div>
            <label htmlFor="botName" className="block text-sm font-medium text-gray-300 mb-1">
              {t('botName')} <span className="text-red-400">*</span>
            </label>
            <input
              id="botName"
              type="text"
              autoComplete="off"
              value={formData.botName}
              onChange={handleBotNameChange}
              maxLength={50}
              className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors.botName ? 'border-red-500' : 'border-gray-600'
                }`}
              placeholder={t('botNamePlaceholder')}
            />
            <div className="flex justify-between">
            <p className="mt-1 text-xs text-gray-400">
              {t('botNameHelper')}
            </p>
            <div className="group relative">
              <button
                type="button"
                className="text-teal-400 hover:text-teal-300 transition"
                title={t('aboutBotNames')}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-gray-700 border border-gray-600 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                <p className="text-xs text-gray-300">
                  {t('botNameInfo')}
                  <br/><br/><strong>{t('botNameWarning')}</strong>
                </p>
              </div>
            </div>
            </div>
            {errors.botName && <p className="mt-1 text-sm text-red-400">{errors.botName}</p>}

          </div>
        )}

        <LLMProviderSelector
          provider={formData.provider}
          model={formData.model}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          providerError={errors.provider}
          modelError={errors.model}
        />

        {formData.provider && (
          <APIKeySelector
            provider={formData.provider}
            apiKey={formData.apiKey}
            apiKeyId={formData.apiKeyId}
            onApiKeyChange={handleApiKeyChange}
            onApiKeyIdChange={handleApiKeyIdChange}
            error={errors.apiKey}
          />
        )}
      </div>
    </WizardStep>
  );
}
