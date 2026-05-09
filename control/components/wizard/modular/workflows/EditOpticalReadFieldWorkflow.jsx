'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const ID_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

export default function EditOpticalReadFieldWorkflow({ field, onClose, onUpdateField, existingIdNames = [] }) {
  const t = useTranslations('wizard.modular');
  const tOptical = useTranslations('wizard.opticalRead');
  const tCommon = useTranslations('common');
  const [formData, setFormData] = useState({
    label: field.label || '',
    idName: field.idName || '',
    hint: field.hint || '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.label.trim()) {
      newErrors.label = tOptical('labelRequired');
    }
    if (!formData.idName.trim()) {
      newErrors.idName = tOptical('idNameRequired');
    } else if (!ID_NAME_PATTERN.test(formData.idName.trim())) {
      newErrors.idName = tOptical('idNameInvalid');
    } else if (existingIdNames.includes(formData.idName.trim())) {
      newErrors.idName = tOptical('idNameDuplicate');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdate = () => {
    if (!validateForm()) return;
    onUpdateField({
      label: formData.label.trim(),
      idName: formData.idName.trim(),
      hint: formData.hint.trim(),
    });
  };

  const isFormValid = formData.label.trim() && formData.idName.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl border border-gray-700 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-medium text-gray-100">{t('editOpticalReadField')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {tOptical('label')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  placeholder={tOptical('labelPlaceholder')}
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 ${
                    errors.label ? 'border-red-500' : 'border-gray-600'
                  }`}
                />
                {errors.label && <p className="mt-1 text-xs text-red-400">{errors.label}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {tOptical('idName')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.idName}
                  onChange={(e) => handleChange('idName', e.target.value)}
                  placeholder={tOptical('idNamePlaceholder')}
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 font-mono ${
                    errors.idName ? 'border-red-500' : 'border-gray-600'
                  }`}
                />
                {errors.idName && <p className="mt-1 text-xs text-red-400">{errors.idName}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {tOptical('hint')}
              </label>
              <textarea
                value={formData.hint}
                onChange={(e) => handleChange('hint', e.target.value)}
                placeholder={tOptical('hintPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none text-sm text-gray-100 placeholder-gray-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {tOptical('hintHelper')}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-700 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={!isFormValid}
            className="flex-1 py-2 px-4 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
          >
            {t('updateOpticalReadField')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition"
          >
            {tCommon('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
