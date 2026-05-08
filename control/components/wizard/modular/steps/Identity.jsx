'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import FormField from '../../../shared/FormField';
import ArrayField from '../../../shared/ArrayField';

export default function Identity({ stepConfig, isEditMode = false }) {
  const { formData, updateFormData, updateUISettings, errors, clearError } = useModularWizard();
  const t = useTranslations('wizard.identity');

  const handleObjectiveChange = (e) => {
    updateFormData({ objective: e.target.value });
    clearError('objective');
  };

  const handleFirstMessageChange = (e) => {
    updateFormData({ firstMessage: e.target.value });
    clearError('firstMessage');
  };

  const handleChatDisplayNameChange = (e) => {
    const value = e.target.value;
    updateFormData({ chatDisplayName: value });
    updateUISettings({ chatDisplayName: value });
    clearError('chatDisplayName');
  };

  const handlePlaceholderChange = (e) => {
    updateUISettings({ placeholder: e.target.value });
  };

  const handleAddPrompt = () => {
    const newPrompts = [...formData.suggestedPrompts, { suggestedPrompt: '' }];
    updateFormData({ suggestedPrompts: newPrompts });
  };

  const handleUpdatePrompt = (index, value) => {
    const newPrompts = [...formData.suggestedPrompts];
    newPrompts[index] = { suggestedPrompt: value };
    updateFormData({ suggestedPrompts: newPrompts });
  };

  const handleRemovePrompt = (index) => {
    const newPrompts = formData.suggestedPrompts.filter((_, i) => i !== index);
    updateFormData({ suggestedPrompts: newPrompts });
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">

        {/* Chat Display Name */}
        <FormField
          label={t('chatDisplayName')}
          value={formData.chatDisplayName}
          onChange={handleChatDisplayNameChange}
          error={errors.chatDisplayName}
          type="text"
          required
          placeholder={t('chatDisplayNamePlaceholder')}
          helperText={t('chatDisplayNameHelper')}
        />

        {/* Objective/Persona */}
        <FormField
          label={t('personaObjective')}
          value={formData.objective}
          onChange={handleObjectiveChange}
          error={errors.objective}
          type="textarea"
          required
          rows={5}
          placeholder={t('personaObjectivePlaceholder')}
          helperText={t('personaObjectiveHelper')}
        />


        {/* First Message */}
        <FormField
          label={t('welcomeMessage')}
          value={formData.firstMessage}
          onChange={handleFirstMessageChange}
          error={errors.firstMessage}
          type="textarea"
          required
          rows={3}
          placeholder={t('welcomeMessagePlaceholder')}
          helperText={t('welcomeMessageHelper')}
        />

        {/* Suggested Prompts */}
        <div className="border-t border-gray-700 pt-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">{t('suggestedPrompts')}</h3>
            <p className="text-xs text-gray-400">
              {t('suggestedPromptsHelper')}
            </p>
          </div>

          <ArrayField
            items={formData.suggestedPrompts}
            onAdd={handleAddPrompt}
            onUpdate={handleUpdatePrompt}
            onRemove={handleRemovePrompt}
            itemLabel={t('promptItemLabel')}
            placeholder={t('promptPlaceholder')}
            maxItems={5}
          />
        </div>

        {/* Input Placeholder */}
        <div className="border-t border-gray-700 pt-6">
          <FormField
            label={t('inputPlaceholder')}
            value={formData.uiSettings.placeholder}
            onChange={handlePlaceholderChange}
            type="text"
            placeholder={t('inputPlaceholderDefault')}
            helperText={t('inputPlaceholderHelper')}
          />
        </div>
      </div>
    </WizardStep>
  );
}
