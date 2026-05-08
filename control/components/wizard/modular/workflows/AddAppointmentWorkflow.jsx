'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function AddAppointmentWorkflow({ onClose, onAddAppointment, existingIds = [] }) {
  const t = useTranslations('wizard.modular');
  const tAppts = useTranslations('wizard.appointments');
  const tCommon = useTranslations('common');
  const [formData, setFormData] = useState({
    id: '',
    provider: 'calendly',
    popupUrl: '',
    description: ''
  });
  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
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

    if (!formData.id.trim()) {
      newErrors.id = tAppts('calendarIdRequired');
    } else if (existingIds.includes(formData.id.trim())) {
      newErrors.id = tAppts('calendarIdExists');
    }

    if (!formData.provider.trim()) {
      newErrors.provider = tAppts('providerNameRequired');
    }

    if (!formData.popupUrl.trim()) {
      newErrors.popupUrl = tAppts('popupUrlRequired');
    } else {
      try {
        new URL(formData.popupUrl.trim());
      } catch {
        newErrors.popupUrl = tAppts('popupUrlInvalid');
      }
    }

    if (!formData.description.trim()) {
      newErrors.description = tAppts('descriptionRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onAddAppointment({
      id: formData.id.trim(),
      provider: formData.provider.trim(),
      popupUrl: formData.popupUrl.trim(),
      description: formData.description.trim()
    });
  };

  const isFormValid = formData.id.trim() && formData.provider.trim() &&
                      formData.popupUrl.trim() && formData.description.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl border border-gray-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-medium text-gray-100">{t('addCalendarProvider')}</h3>
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
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-5">
            {/* Calendar ID */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {tAppts('calendarId')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => handleChange('id', e.target.value)}
                placeholder={tAppts('calendarIdPlaceholder')}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 ${
                  errors.id ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              {errors.id && <p className="mt-1 text-xs text-red-400">{errors.id}</p>}
              <p className="mt-1 text-xs text-gray-400">
                {tAppts('calendarIdHelper')}
              </p>
            </div>

            {/* Provider Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {tAppts('providerName')} <span className="text-red-400">*</span>
              </label>
              <select
                value={formData.provider}
                onChange={(e) => handleChange('provider', e.target.value)}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 ${
                  errors.provider ? 'border-red-500' : 'border-gray-600'
                }`}
              >
                <option value="calendly">Calendly</option>
                <option value="cal.com">Cal.com</option>
                <option value="google_calendar">Google Calendar</option>
                <option value="outlook">Outlook</option>
              </select>
              {errors.provider && <p className="mt-1 text-xs text-red-400">{errors.provider}</p>}
              <p className="mt-1 text-xs text-gray-400">
                {tAppts('providerNameHelper')}
              </p>
            </div>

            {/* Popup URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {tAppts('popupUrl')} <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                value={formData.popupUrl}
                onChange={(e) => handleChange('popupUrl', e.target.value)}
                placeholder={tAppts('popupUrlPlaceholder')}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm text-gray-100 placeholder-gray-500 ${
                  errors.popupUrl ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              {errors.popupUrl && <p className="mt-1 text-xs text-red-400">{errors.popupUrl}</p>}
              <p className="mt-1 text-xs text-gray-400">
                {tAppts('popupUrlHelper')}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                {t('description')} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder={tAppts('descriptionPlaceholder')}
                rows={4}
                className={`w-full px-3 py-2 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none text-sm text-gray-100 placeholder-gray-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-600'
                }`}
              />
              {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
              <p className="mt-1 text-xs text-gray-400">
                {tAppts('descriptionHelper')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2 px-4 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
          >
            {t('addCalendarProvider')}
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
