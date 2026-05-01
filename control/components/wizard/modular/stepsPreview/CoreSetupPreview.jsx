'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';

export default function CoreSetupPreview() {
  const t = useTranslations('wizard.botSummary');
  const { formData, updateFormData } = useModularWizard();

  const handleBotSummaryChange = (e) => {
    updateFormData({ botSummary: e.target.value });
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-900">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-100">{t('title')}</h3>
              <div className="group relative">
                <button
                  type="button"
                  className="text-teal-400 hover:text-teal-300 transition"
                  title={t('whyFillThis')}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-gray-700 border border-gray-600 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <p className="text-xs text-gray-300">
                    <strong>{t('whyFillThis')}</strong>
                    <br /><br />
                    {t('tooltipLine1')}
                    <br /><br />
                    {t('tooltipLine2')}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-400">{t('description')} <strong>{t('notSystemPrompt')}</strong></p>
          </div>
        </div>
      </div>

      {/* Textarea */}
      <div className="flex flex-col">
        <label htmlFor="botSummaryPreview" className="sr-only">{t('title')}</label>
        <textarea
          id="botSummaryPreview"
          value={formData.botSummary || ''}
          onChange={handleBotSummaryChange}
          className="h-60 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none text-gray-100 placeholder-gray-500"
          placeholder={t('placeholder')}
        />
        <p className="mt-2 text-xs text-gray-500 text-right">
          {formData.botSummary?.length || 0} {t('characters')}
        </p>
      </div>

      {/* Optional badge */}
      <div className="mt-4 flex flex justify-center">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-400">
          {t('optionalBadge')}
        </span>
      </div>
    </div>
  );
}
