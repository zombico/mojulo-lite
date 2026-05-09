'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import AddOpticalReadFieldWorkflow from '../workflows/AddOpticalReadFieldWorkflow';

export default function OpticalReadConfig({ stepConfig, isEditMode = false }) {
  const t = useTranslations('wizard.opticalRead');
  const tModular = useTranslations('wizard.modular');
  const { formData, updateProtocolData, errors, clearError } = useModularWizard();

  void isEditMode;

  const fields = formData.opticalReadFields || [];
  const showUploadOnStart = !!formData.opticalReadShowUploadOnStart;
  const provider = formData.provider;
  const providerSupported = provider === 'anthropic';

  const [showAddModal, setShowAddModal] = useState(false);

  const handleToggleStartUpload = () => {
    updateProtocolData('opticalRead', { showUploadOnStart: !showUploadOnStart });
  };

  const handleAddField = (field) => {
    updateProtocolData('opticalRead', { fields: [...fields, field] });
    if (errors.opticalReadFields) clearError('opticalReadFields');
    setShowAddModal(false);
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">
        {!providerSupported && (
          <div className="p-3 bg-amber-900/30 border border-amber-800 rounded-lg flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-amber-300 text-sm">
              {t('providerNotSupported')}
            </span>
          </div>
        )}

        <p className="text-sm text-gray-400">{t('intro')}</p>

        <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-700 bg-gray-700 hover:border-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showUploadOnStart}
            onChange={handleToggleStartUpload}
            disabled={!providerSupported}
            className="mt-0.5 w-4 h-4 accent-teal-500"
          />
          <span>
            <span className="block text-sm text-gray-100">{t('showUploadOnStart')}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t('showUploadOnStartHelper')}</span>
          </span>
        </label>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          disabled={!providerSupported}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-teal-500 hover:text-teal-400 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-600 disabled:hover:text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {tModular('addOpticalReadField')}
        </button>

        {fields.length === 0 && (
          <p className="text-sm text-gray-500 text-center">{t('noFieldsYet')}</p>
        )}

        {errors.opticalReadFields && (
          <p className="text-sm text-red-400">{errors.opticalReadFields}</p>
        )}
      </div>

      {showAddModal && (
        <AddOpticalReadFieldWorkflow
          onClose={() => setShowAddModal(false)}
          existingIdNames={fields.map(f => f.idName).filter(Boolean)}
          onAddField={handleAddField}
        />
      )}
    </WizardStep>
  );
}
