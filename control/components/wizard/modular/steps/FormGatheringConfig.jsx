'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import FormField from '../../../shared/FormField';
import GenerationPanel from '../../../shared/GenerationPanel';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/form-schema-config';

export default function FormGatheringConfig({ stepConfig }) {
  const { formData, updateFormData, errors, clearError } = useModularWizard();
  const [generatingForm, setGeneratingForm] = useState(false);
  const [formError, setFormError] = useState('');
  const t = useTranslations('wizard.infoGathering');

  // Group locales by region for the dropdown
  const localesByRegion = SUPPORTED_LOCALES.reduce((acc, locale) => {
    if (!acc[locale.region]) acc[locale.region] = [];
    acc[locale.region].push(locale);
    return acc;
  }, {});

  const handleLocaleChange = (e) => {
    updateFormData({ formLocale: e.target.value });
  };

  const handleFormInputChange = (e) => {
    updateFormData({ formStructureInput: e.target.value });
  };

  const handleGenerateForm = async () => {
    if (!formData.formStructureInput.trim()) {
      setFormError(t('errorNoDescription'));
      return;
    }

    // A saved-key pick clears apiKey in favor of an opaque apiKeyId; edit
    // mode advertises an existing on-file credential via hasStoredApiKey +
    // editDeploymentId. Any one of the three is enough — the route resolves
    // the plaintext server-side. Ollama is credential-less and skips this
    // gate entirely (the route falls back to defaultHost if no host is set).
    const isOllama = formData.provider === 'ollama';
    const hasCredential = isOllama || !!(
      formData.apiKey ||
      formData.apiKeyId ||
      (formData.hasStoredApiKey && formData.editDeploymentId)
    );
    if (!hasCredential) {
      setFormError(t('errorNoApiKey'));
      return;
    }

    try {
      setGeneratingForm(true);
      setFormError('');

      const response = await fetch('/api/generate-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          naturalLanguageInput: formData.formStructureInput,
          provider: formData.provider,
          model: formData.model,
          apiKey: formData.apiKey,
          apiKeyId: formData.apiKeyId || null,
          editDeploymentId: formData.editDeploymentId || null,
          locale: formData.formLocale || DEFAULT_LOCALE
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate form');
      }

      const data = await response.json();
      updateFormData({ generatedFormJson: JSON.stringify(data.formStructure, null, 2) });
      clearError('generatedFormJson');
    } catch (error) {
      console.error('Error generating form:', error);
      setFormError(error.message);
    } finally {
      setGeneratingForm(false);
    }
  };

  const handleWebhookChange = (e) => {
    updateFormData({ formCompletionWebhook: e.target.value });
    clearError('formCompletionWebhook');
  };

  const handleAfterSubmitChange = (e) => {
    updateFormData({ afterSubmitChatMessage: e.target.value });
    clearError('afterSubmitChatMessage');
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">


        {/* Locale Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            {t('formRegion')}
          </label>
          <select
            value={formData.formLocale || DEFAULT_LOCALE}
            onChange={handleLocaleChange}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {Object.entries(localesByRegion).map(([region, locales]) => (
              <optgroup key={region} label={region}>
                {locales.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.flag} {locale.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {t('formRegionHelper')}
          </p>
        </div>

        {/* Natural Language Form Description */}
        <div>
          <FormField
            label={t('describeInfo')}
            value={formData.formStructureInput}
            onChange={handleFormInputChange}
            type="textarea"
            rows={4}
            placeholder={t('describeInfoPlaceholder')}
            helperText={formData.generatedFormJson && !formData.formStructureInput
              ? t('describeInfoHelperEdit')
              : t('describeInfoHelper')}
          />
        </div>

        {/* Generate Button */}
        <GenerationPanel
          title={t('aiFormGeneration')}
          description={formData.generatedFormJson
            ? t('regenerateDescription')
            : t('generateDescription')}
          onGenerate={handleGenerateForm}
          isGenerating={generatingForm}
          bgColor="purple"
        />

        {formError && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
            {formError}
          </div>
        )}

        {/* Info about JSON View */}
        {formData.generatedFormJson && !errors.generatedFormJson && (
          <div className="bg-teal-900/30 border border-teal-800 text-teal-300 px-4 py-3 rounded-lg text-sm">
            {t('jsonViewTip')}
          </div>
        )}

        {/* JSON Validation Error */}
        {errors.generatedFormJson && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
            <strong>Error:</strong> {errors.generatedFormJson}
          </div>
        )}

        {/* Form Submission Options */}
        <div className="border border-gray-700 rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-medium text-gray-300">{t('formSubmissionOptions')}</h3>

          {/* Send to Control Plane */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="formSendHome"
              checked={formData.formSendHome || false}
              onChange={(e) => updateFormData({ formSendHome: e.target.checked })}
              className="mt-1 h-4 w-4 text-purple-500 focus:ring-purple-500 bg-gray-700 border-gray-600 rounded"
            />
            <div>
              <label htmlFor="formSendHome" className="text-sm font-medium text-gray-300 cursor-pointer">
                {t('sendToControlPlane')}
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('sendToControlPlaneHelper')}
              </p>
            </div>
          </div>

          {/* Webhook URL */}
          <FormField
            label={t('webhookUrl')}
            value={formData.formCompletionWebhook}
            onChange={handleWebhookChange}
            error={errors.formCompletionWebhook}
            type="text"
            placeholder={t('webhookUrlPlaceholder')}
            helperText={t('webhookUrlHelper')}
          />
        </div>

        {/* After Submit Message */}
        <FormField
          label={t('afterSubmitMessage')}
          value={formData.afterSubmitChatMessage}
          onChange={handleAfterSubmitChange}
          error={errors.afterSubmitChatMessage}
          type="textarea"
          required
          rows={3}
          placeholder={t('afterSubmitPlaceholder')}
          helperText={t('afterSubmitHelper')}
        />

        {/* Terms and Conditions  */}
        <div className="border border-gray-700 rounded-lg p-4 space-y-4">
          <FormField
            label={t('termsAndConditions')}
            value={formData.termsAndConditions}
            onChange={(e) => updateFormData({ termsAndConditions: e.target.value })}
            type="textarea"
            rows={8}
            placeholder={t('termsPlaceholder')}
            helperText={t('termsHelper')}
          />
          <p className="text-xs text-gray-500">
            {t('termsInfo')}
          </p>
        </div>
      </div>
    </WizardStep>
  );
}
