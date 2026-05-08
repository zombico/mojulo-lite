'use client';

import { useTranslations } from 'next-intl';

export default function FormField({
  label,
  value,
  onChange,
  error,
  type = 'text',
  required = false,
  placeholder = '',
  rows = 3,
  options = [],
  disabled = false,
  helperText = '',
  maxLength = null,
  id = null
}) {
  const t = useTranslations('common');
  const fieldId = id || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = !!error;

  const baseInputClasses = `w-full px-3 py-2 bg-gray-700 border rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 ${
    hasError ? 'border-red-500' : 'border-gray-600'
  } ${disabled ? 'bg-gray-800 cursor-not-allowed text-gray-500' : ''}`;

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <textarea
            id={fieldId}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            maxLength={maxLength}
            className={baseInputClasses}
          />
        );

      case 'select':
        return (
          <select
            id={fieldId}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className={baseInputClasses}
          >
            <option value="">{t('selectAnOption')}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              id={fieldId}
              checked={value}
              onChange={onChange}
              disabled={disabled}
              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 rounded focus:ring-teal-500"
            />
            {label && (
              <label htmlFor={fieldId} className="ml-2 text-sm text-gray-300">
                {label}
                {required && <span className="text-red-400 ml-1">*</span>}
              </label>
            )}
          </div>
        );

      default:
        return (
          <input
            type={type}
            id={fieldId}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            className={baseInputClasses}
          />
        );
    }
  };

  // For checkbox, don't show label above
  if (type === 'checkbox') {
    return (
      <div className="mb-4">
        {renderInput()}
        {helperText && (
          <p className="mt-1 text-xs text-gray-500">{helperText}</p>
        )}
        {hasError && (
          <p className="mt-1 text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-gray-300 mb-1">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      {renderInput()}
      {helperText && (
        <p className="mt-1 text-xs text-gray-500">{helperText}</p>
      )}
      {maxLength && type !== 'checkbox' && (
        <p className="mt-1 text-xs text-gray-500">
          {value?.length || 0} / {maxLength}
        </p>
      )}
      {hasError && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
