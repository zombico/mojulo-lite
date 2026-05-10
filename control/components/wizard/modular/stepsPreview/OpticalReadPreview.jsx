'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import EditOpticalReadFieldWorkflow from '../workflows/EditOpticalReadFieldWorkflow';

export default function OpticalReadPreview({ activeTab = 'fields' }) {
  const t = useTranslations('wizard.previews.opticalRead');
  const tOptical = useTranslations('wizard.opticalRead');
  const tModular = useTranslations('wizard.modular');
  const { formData, updateProtocolData, errors, clearError } = useModularWizard();
  const fields = formData.opticalReadFields || [];

  const [editingField, setEditingField] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  const writeFields = (next) => {
    updateProtocolData('opticalRead', { fields: next });
    if (errors.opticalReadFields) clearError('opticalReadFields');
  };

  const handleEdit = (field, index) => {
    setEditingField(field);
    setEditingIndex(index);
  };

  const handleUpdate = (updated) => {
    const next = fields.map((f, i) => (i === editingIndex ? { ...f, ...updated } : f));
    writeFields(next);
    setEditingField(null);
    setEditingIndex(null);
  };

  const handleRemove = (index, e) => {
    e.stopPropagation();
    writeFields(fields.filter((_, i) => i !== index));
  };

  if (activeTab === 'preview') {
    if (fields.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">{t('noFields')}</p>
          <p className="text-xs mt-1">{t('noFieldsHint')}</p>
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto p-6 flex justify-center items-start">
        <div className="w-full max-w-md">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            {t('clientPreviewLabel')}
          </p>
          <div className="rounded-lg border border-gray-400 bg-white p-3 shadow-sm">
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={index}>
                  <label className="block text-xs text-gray-700 opacity-80 mb-0.5">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value=""
                    disabled
                    placeholder={field.hint || ''}
                    className="w-full px-2 py-1.5 border border-gray-500 rounded text-sm text-gray-700 bg-gray-100 placeholder-gray-400"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                disabled
                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white text-gray-700 opacity-50 cursor-not-allowed"
              >
                {t('editButton')}
              </button>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 text-sm border border-gray-300 rounded bg-white text-gray-700 opacity-50 cursor-not-allowed"
              >
                {t('sendButton')}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {t('previewNote')}
          </p>
        </div>
      </div>
    );
  }

  // Fields tab (default)
  return (
    <div className="h-full overflow-auto p-6">
      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">{t('noFields')}</p>
          <p className="text-xs mt-1">{t('noFieldsHint')}</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl mx-auto">
          {fields.map((field, index) => (
            <div
              key={index}
              className="w-full text-left p-4 rounded-lg border border-gray-700 bg-gray-800 group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 bg-sky-900/50 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-100 truncate">
                      {field.label}
                      <span className="rounded bg-gray-600 text-xs p-1 ml-2 text-gray-300 font-mono">{field.idName}</span>
                    </h4>
                    {field.hint && (
                      <p className="text-sm text-gray-500 truncate max-w-md">{field.hint}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(field, index)}
                    aria-label={tModular('editOpticalReadField')}
                    title={tModular('editOpticalReadField')}
                    className="p-1.5 border border-gray-600 rounded text-gray-400 hover:text-teal-400 hover:border-teal-500 bg-transparent transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemove(index, e)}
                    aria-label={tOptical('deleteField')}
                    title={tOptical('deleteField')}
                    className="text-gray-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingField && (
        <EditOpticalReadFieldWorkflow
          field={editingField}
          onClose={() => {
            setEditingField(null);
            setEditingIndex(null);
          }}
          existingIdNames={fields
            .filter((_, i) => i !== editingIndex)
            .map(f => f.idName)
            .filter(Boolean)}
          onUpdateField={handleUpdate}
        />
      )}
    </div>
  );
}
