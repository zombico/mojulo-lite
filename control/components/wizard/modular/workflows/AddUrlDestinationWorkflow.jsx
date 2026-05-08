'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function AddUrlDestinationWorkflow({ onClose, onAddDestination }) {
  const t = useTranslations('wizard.modular');
  const tTriage = useTranslations('wizard.triage');
  const tCommon = useTranslations('common');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t('displayNameRequired');
    }

    if (!formData.description.trim()) {
      newErrors.description = t('descriptionRequired');
    }

    if (!formData.url.trim()) {
      newErrors.url = t('urlRequired');
    } else {
      try {
        new URL(formData.url.trim());
      } catch {
        newErrors.url = t('urlInvalid');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    if (!validateForm()) return;

    onAddDestination({
      name: formData.name.trim(),
      description: formData.description.trim(),
      url: formData.url.trim(),
    });
  };

  const isFormValid = formData.name.trim() && formData.description.trim() && formData.url.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-medium text-gray-100">{t('addUrlDestination')}</h3>
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

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('url')} <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => handleChange('url', e.target.value)}
              placeholder={t('urlPlaceholder')}
              className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 ${
                errors.url ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {errors.url && <p className="mt-1 text-xs text-red-400">{errors.url}</p>}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('displayName')} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder={t('displayNamePlaceholder')}
              className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 ${
                errors.name ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {t('description')} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={4}
              className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none text-sm text-gray-100 placeholder-gray-500 ${
                errors.description ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
            <p className="mt-1 text-xs text-gray-500">
              {tTriage('descriptionHelper')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!isFormValid}
            className="flex-1 py-2 px-4 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
          >
            {t('addRoutingDestination')}
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
