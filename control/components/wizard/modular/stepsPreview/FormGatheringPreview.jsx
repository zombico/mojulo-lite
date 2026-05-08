'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import './preview.css';

export default function FormGatheringPreview({ activeTab = 'fields' }) {
  const t = useTranslations('wizard.previews.form');
  const tCommon = useTranslations('common');
  const { formData, updateFormData, clearError } = useModularWizard();
  const [validationErrors, setValidationErrors] = useState({});
  const [jsonError, setJsonError] = useState(null);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [modalJsonText, setModalJsonText] = useState('');
  const [modalJsonError, setModalJsonError] = useState(null);

  // Parse form structure from JSON
  let formStructure = null;
  let formFields = [];

  if (formData.generatedFormJson) {
    try {
      formStructure = JSON.parse(formData.generatedFormJson);
      // Extract all fields from all sections
      if (formStructure.sections) {
        formStructure.sections.forEach(section => {
          if (section.fields) {
            formFields = [...formFields, ...section.fields.map(field => ({...field, sectionId: section.id}))];
          }
        });
      }
    } catch (error) {
      console.error('Error parsing form JSON:', error);
    }
  }

  const handleFormJsonChange = (e) => {
    const newValue = e.target.value;
    updateFormData({ generatedFormJson: newValue });

    // Validate JSON
    if (newValue.trim()) {
      try {
        JSON.parse(newValue);
        setJsonError(null);
        clearError('generatedFormJson');
      } catch (error) {
        setJsonError(error.message);
      }
    } else {
      setJsonError(null);
      clearError('generatedFormJson');
    }
  };

  const handleOpenJsonModal = () => {
    setModalJsonText(formData.generatedFormJson || '');
    setModalJsonError(null);
    setShowJsonModal(true);
  };

  const handleModalJsonChange = (e) => {
    const newValue = e.target.value;
    setModalJsonText(newValue);

    // Validate JSON in modal
    if (newValue.trim()) {
      try {
        JSON.parse(newValue);
        setModalJsonError(null);
      } catch (error) {
        setModalJsonError(error.message);
      }
    } else {
      setModalJsonError(null);
    }
  };

  const handleSaveJsonModal = () => {
    // Only save if JSON is valid
    if (!modalJsonError) {
      updateFormData({ generatedFormJson: modalJsonText });
      clearError('generatedFormJson');
      setJsonError(null);
      setShowJsonModal(false);
    }
  };

  const handleCancelJsonModal = () => {
    setShowJsonModal(false);
    setModalJsonText('');
    setModalJsonError(null);
  };

  const handleValidate = (field, index) => {
    const fieldId = `field-${field.id || index}`;
    const inputElement = document.getElementById(fieldId);

    if (inputElement) {
      if (inputElement.checkValidity()) {
        setValidationErrors(prev => {
          const newErrors = {...prev};
          delete newErrors[fieldId];
          return newErrors;
        });
      } else {
        setValidationErrors(prev => ({
          ...prev,
          [fieldId]: inputElement.validationMessage
        }));
      }
    }
  };

  const renderFormInput = (field, index) => {
    const fieldId = `field-${field.id || index}`;
    const hasPattern = field.pattern && (field.type === 'text' || field.type === 'email' || field.type === 'tel');

    switch (field.type) {
      case 'text':
      case 'email':
      case 'tel':
      case 'number':
        return (
          <div key={fieldId} className="preview-input-with-validation">
            <input
              type={field.type}
              id={fieldId}
              className="form-input"
              placeholder={field.placeholder || ''}
              pattern={field.pattern}
              title={field.patternError || ''}
              min={field.min}
              max={field.max}
            />
            {hasPattern && (
              <button
                type="button"
                className="preview-validate-btn"
                onClick={() => handleValidate(field, index)}
                title={t('validateInput')}
              >
                {t('validate')}
              </button>
            )}
            {validationErrors[fieldId] && (
              <div className="preview-validation-error">{validationErrors[fieldId]}</div>
            )}
          </div>
        );

      case 'date':
        return (
          <input
            key={fieldId}
            type="date"
            id={fieldId}
            className="form-input"
          />
        );

      case 'textarea':
        return (
          <textarea
            key={fieldId}
            id={fieldId}
            className="form-input"
            rows={field.rows || 3}
            placeholder={field.placeholder || ''}
          />
        );

      case 'dropdown':
        return (
          <select key={fieldId} id={fieldId} className="form-input">
            <option value="">{field.placeholder || t('selectOption')}</option>
            {field.options && field.options.map((option, optIndex) => (
              <option key={optIndex} value={option.value || option}>
                {option.label || option}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <input
            key={fieldId}
            type="checkbox"
            id={fieldId}
            className="form-input"
          />
        );

      case 'radio':
        return (
          <div key={fieldId} className="radio-group form-input">
            {field.options && field.options.map((option, optIndex) => (
              <div key={optIndex} className="radio-option">
                <input
                  type="radio"
                  id={`${fieldId}-${optIndex}`}
                  name={fieldId}
                  value={option.value || option}
                  className="radio-input"
                />
                <label htmlFor={`${fieldId}-${optIndex}`} className="radio-label">
                  {option.label || option}
                </label>
              </div>
            ))}
          </div>
        );

      default:
        return (
          <input
            key={fieldId}
            type="text"
            id={fieldId}
            className="form-input"
          />
        );
    }
  };

  // JSON View Tab
  if (activeTab === 'json') {
    if (!formData.generatedFormJson) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">{t('noStructure')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col bg-gray-900">
        {/* JSON Modal */}
        {showJsonModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[95vh] flex flex-col border border-gray-700">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-100">{t('editJsonTitle')}</h3>
                <button
                  onClick={handleCancelJsonModal}
                  className="text-gray-400 hover:text-gray-200 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-end mb-2">
                    {modalJsonError && (
                      <span className="text-xs font-medium text-red-400 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {t('invalidJson')}
                      </span>
                    )}
                    {!modalJsonError && modalJsonText && (
                      <span className="text-xs font-medium text-green-400 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {t('validJson')}
                      </span>
                    )}
                  </div>
                  <textarea
                    value={modalJsonText}
                    onChange={handleModalJsonChange}
                    className={`flex-1 w-full font-mono text-xs p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-100 ${modalJsonError ? 'border-red-500 bg-red-900/30' : 'border-gray-600 bg-gray-700'}`}
                    spellCheck="false"
                    autoFocus
                  />
                  {modalJsonError && (
                    <div className="mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg">
                      <p className="text-xs font-semibold text-red-300 mb-1">{t('jsonParseError')}</p>
                      <p className="text-xs text-red-400 font-mono">{modalJsonError}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-gray-700 flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelJsonModal}
                  className="px-4 py-2 text-gray-300 font-medium hover:text-gray-100 transition"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleSaveJsonModal}
                  disabled={!!modalJsonError}
                  className="px-6 py-2 bg-teal-600 text-white font-medium rounded-md hover:bg-teal-500 transition disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {tCommon('save')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-4">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium text-gray-300">
                  {t('generatedJsonLabel')}
                </label>
                <button
                  onClick={handleOpenJsonModal}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-teal-400 hover:text-teal-300 hover:bg-teal-900/30 rounded-md transition"
                  title={t('openLargerView')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  {t('expand')}
                </button>
              </div>
              {jsonError && (
                <span className="text-xs font-medium text-red-400 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {t('invalidJson')}
                </span>
              )}
              {!jsonError && formData.generatedFormJson && (
                <span className="text-xs font-medium text-green-400 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  {t('validJson')}
                </span>
              )}
            </div>
            <textarea
              value={formData.generatedFormJson}
              onChange={handleFormJsonChange}
              className={`flex-1 w-full font-mono text-xs p-4 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-100 ${jsonError ? 'border-red-500 bg-red-900/30' : 'border-gray-600 bg-gray-700'}`}
              spellCheck="false"
            />
            {jsonError && (
              <div className="mt-2 p-3 bg-red-900/30 border border-red-800 rounded-lg">
                <p className="text-xs font-semibold text-red-300 mb-1">{t('jsonParseError')}</p>
                <p className="text-xs text-red-400 font-mono">{jsonError}</p>
              </div>
            )}
            {!jsonError && (
              <p className="mt-2 text-xs text-gray-400">
                {t('editJsonHelper')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Flow View Tab - vertical tree with branch connections
  if (activeTab === 'flow') {
    if (!formStructure) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">{t('noStructure')}</p>
          </div>
        </div>
      );
    }

    const branches = formStructure.branches || [];

    // Helper to get condition label
    const getConditionLabel = (condition) => {
      if (!condition) return null;
      if (condition.branch) {
        const prefix = condition.not ? 'NOT ' : '';
        return `${prefix}${condition.branch}`;
      }
      if (condition.logic && condition.branches) {
        const negated = condition.not || [];
        const parts = condition.branches.map(b =>
          negated.includes(b) ? `NOT ${b}` : b
        );
        return parts.join(` ${condition.logic.toUpperCase()} `);
      }
      return null;
    };

    return (
      <div className="h-full flex flex-col bg-gray-900 overflow-auto p-4">
        {/* Branches Legend */}
        {branches.length > 0 && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
            <div className="text-xs font-medium text-gray-400 mb-2">{t('branches')}</div>
            <div className="flex flex-wrap gap-2">
              {branches.map((branch, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 text-xs font-mono bg-purple-900/50 text-purple-300 rounded"
                >
                  {branch}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Flow Tree */}
        <div className="flow-tree">
          {formStructure.sections?.map((section, sectionIdx) => {
            const sectionCondition = getConditionLabel(section.condition);

            return (
              <div key={section.id} className="flow-section">
                {/* Section Header */}
                <div className="flow-node flow-node-section">
                  <div className="flow-node-connector">
                    <div className="flow-line-vertical" />
                  </div>
                  <div className="flow-node-content">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-100">{section.label}</span>
                      <span className="text-xs text-gray-500">({section.id})</span>
                    </div>
                    {sectionCondition && (
                      <div className="mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                        <span className="text-xs font-mono text-purple-400">{sectionCondition}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fields - split into base and conditional */}
                {(() => {
                  const baseFields = section.fields?.filter(f => !f.condition) || [];
                  const conditionalFields = section.fields?.filter(f => f.condition) || [];

                  return (
                    <div className="flow-fields-container">
                      {/* Base fields column */}
                      <div className="flow-fields-base">
                        {baseFields.map((field, fieldIdx) => {
                          const isLast = fieldIdx === baseFields.length - 1 && conditionalFields.length === 0;

                          return (
                            <div key={field.id} className="flow-node flow-node-field">
                              <div className="flow-node-connector">
                                <div className="flow-line-horizontal" />
                                {!isLast && <div className="flow-line-vertical flow-line-continue" />}
                              </div>
                              <div className={`flow-node-content ${field.required ? 'flow-node-required' : ''}`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-gray-300">{field.label}</span>
                                  {field.required && (
                                    <span className="text-red-400 text-xs">*</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Conditional fields column - grouped by condition */}
                      {conditionalFields.length > 0 && (() => {
                        // Group fields by their condition
                        const groupedByCondition = conditionalFields.reduce((acc, field) => {
                          const conditionKey = JSON.stringify(field.condition);
                          if (!acc[conditionKey]) {
                            acc[conditionKey] = {
                              condition: field.condition,
                              label: getConditionLabel(field.condition),
                              fields: []
                            };
                          }
                          acc[conditionKey].fields.push(field);
                          return acc;
                        }, {});

                        const conditionGroups = Object.values(groupedByCondition);

                        return (
                          <div className="flow-fields-conditional">
                            <div className="flow-branch-connector">
                              <div className="flow-branch-line" />
                              <div className="flow-branch-arrow" />
                            </div>
                            <div className="flow-conditional-groups">
                              {conditionGroups.map((group, groupIdx) => (
                                <div key={groupIdx} className="flow-condition-group">
                                  {/* Condition header */}
                                  <div className="flow-condition-header">
                                    <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                    </svg>
                                    <span className="text-xs font-mono text-purple-400">{group.label}</span>
                                  </div>
                                  {/* Fields in this condition group */}
                                  <div className="flow-conditional-column">
                                    {group.fields.map((field, fieldIdx) => {
                                      const isLast = fieldIdx === group.fields.length - 1;

                                      return (
                                        <div key={field.id} className="flow-node flow-node-field flow-node-conditional">
                                          <div className="flow-node-connector-conditional">
                                            {!isLast && <div className="flow-line-vertical" />}
                                          </div>
                                          <div className={`flow-node-content flow-node-content-conditional ${field.required ? 'flow-node-required' : ''}`}>
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm text-gray-300">{field.label}</span>
                                              {field.required && (
                                                <span className="text-red-400 text-xs">*</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Spacer between sections */}
                {sectionIdx < formStructure.sections.length - 1 && (
                  <div className="flow-section-spacer">
                    <div className="flow-line-vertical" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <style jsx>{`
          .flow-tree {
            position: relative;
            padding-left: 20px;
          }
          .flow-section {
            position: relative;
          }
          .flow-node {
            display: flex;
            align-items: flex-start;
            position: relative;
            padding: 4px 0;
          }
          .flow-node-section {
            margin-bottom: 4px;
          }
          .flow-node-field {
            padding-left: 24px;
          }
          .flow-node-connector {
            position: absolute;
            left: -20px;
            top: 0;
            bottom: 0;
            width: 20px;
          }
          .flow-node-field .flow-node-connector {
            left: 4px;
          }
          .flow-line-vertical {
            position: absolute;
            left: 8px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #374151;
          }
          .flow-line-horizontal {
            position: absolute;
            left: 8px;
            top: 12px;
            width: 12px;
            height: 2px;
            background: #374151;
          }
          .flow-line-continue {
            top: 12px;
          }
          .flow-node-content {
            padding: 6px 10px;
            background: #1f2937;
            border: 1px solid #374151;
            border-radius: 6px;
            min-width: 200px;
          }
          .flow-node-section .flow-node-content {
            background: #111827;
            border-color: #4b5563;
          }
          .flow-node-required .flow-node-content {
            border-left: 3px solid #f87171;
          }
          .flow-section-spacer {
            height: 16px;
            position: relative;
            margin-left: -12px;
          }
          .flow-section-spacer .flow-line-vertical {
            left: 8px;
          }

          /* Two-column layout for base vs conditional fields */
          .flow-fields-container {
            display: flex;
            align-items: flex-start;
            gap: 0;
          }
          .flow-fields-base {
            flex-shrink: 0;
          }
          .flow-fields-conditional {
            display: flex;
            align-items: flex-start;
            margin-left: 24px;
            padding-top: 8px;
          }
          .flow-branch-connector {
            position: relative;
            width: 40px;
            height: 100%;
            min-height: 30px;
            flex-shrink: 0;
          }
          .flow-branch-line {
            position: absolute;
            left: 0;
            top: 12px;
            width: 32px;
            height: 2px;
            background: #a855f7;
          }
          .flow-branch-arrow {
            position: absolute;
            left: 28px;
            top: 8px;
            width: 0;
            height: 0;
            border-top: 5px solid transparent;
            border-bottom: 5px solid transparent;
            border-left: 6px solid #a855f7;
          }
          .flow-conditional-groups {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .flow-condition-group {
            display: flex;
            flex-direction: column;
          }
          .flow-condition-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            background: rgba(147, 51, 234, 0.2);
            border: 1px solid #7c3aed;
            border-radius: 4px;
            margin-bottom: 6px;
          }
          .flow-conditional-column {
            display: flex;
            flex-direction: column;
            border-left: 2px solid #a855f7;
            padding-left: 12px;
            margin-left: 6px;
          }
          .flow-node-conditional {
            padding-left: 0;
          }
          .flow-node-connector-conditional {
            position: absolute;
            left: -14px;
            top: 0;
            bottom: 0;
            width: 14px;
          }
          .flow-node-connector-conditional .flow-line-vertical {
            left: 0;
            background: #a855f7;
          }
          .flow-node-content-conditional {
            background: rgba(147, 51, 234, 0.15);
            border-color: #7c3aed;
          }
        `}</style>
      </div>
    );
  }

  // Fields Display Tab (default)
  if (!formStructure || formFields.length === 0) {
    return (
      <div className="preview-form-validation-container">
        <div className="preview-form-validation-content">
          <div className="preview-form-empty-state">
            <svg className="preview-form-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>{t('noStructure')}</p>
            <p className="preview-form-hint">{t('noStructureHint')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-form-validation-container">


      {/* Clean Form Fields */}
      <div className="preview-form-validation-content">
        <div className="preview-form-clean-fields">
          {formFields.map((field, index) => (
            <div key={index} className="preview-form-field-item" data-field-id={field.id}>
              <label className="preview-form-field-label" htmlFor={`field-${field.id || index}`}>
                {field.label}
                {field.required && <span className="required"> *</span>}
              </label>
              <div className="preview-form-field-input-wrapper">
                {renderFormInput(field, index)}
              </div>
              <div className="preview-form-field-meta">
                <span className="preview-form-field-type">{field.type}</span>
                {field.required && <span className="preview-form-field-badge">{t('requiredBadge')}</span>}
                {field.pii && <span className="preview-form-field-badge pii">{t('piiBadge')}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
