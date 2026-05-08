'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import AddTriageDestinationWorkflow from '../workflows/AddTriageDestinationWorkflow';
import AddUrlDestinationWorkflow from '../workflows/AddUrlDestinationWorkflow';
import EditTriageDestinationWorkflow from '../workflows/EditTriageDestinationWorkflow';

export default function TriageConfig({ stepConfig, isEditMode = false }) {
  const t = useTranslations('wizard.modular');
  const tTriage = useTranslations('wizard.triage');
  const { formData, updateFormData, errors, clearError } = useModularWizard();
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showBotModal, setShowBotModal] = useState(false);
  const [editingDestination, setEditingDestination] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  void isEditMode;
  void clearError;

  const handleAddUrlDestination = () => {
    setShowUrlModal(true);
  };

  const handleUrlModalAdd = (newDestination) => {
    const slugify = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const deploymentId = slugify(newDestination.name);

    const newRoutes = [...(formData.triageRoutes || []), {
      deploymentId,
      name: newDestination.name,
      description: newDestination.description,
      url: newDestination.url,
    }];

    updateFormData({ triageRoutes: newRoutes });
    setShowUrlModal(false);
  };

  const handleRedirectToBot = () => {
    setShowBotModal(true);
  };

  const handleBotModalAdd = (newDestination) => {
    const newRoutes = [...(formData.triageRoutes || []), newDestination];
    updateFormData({ triageRoutes: newRoutes });
    setShowBotModal(false);
  };

  const handleEditDestination = (destination, index) => {
    setEditingDestination(destination);
    setEditingIndex(index);
  };

  const handleUpdateDestination = (updatedDestination) => {
    const updated = [...(formData.triageRoutes || [])];
    updated[editingIndex] = { ...updated[editingIndex], ...updatedDestination };
    updateFormData({ triageRoutes: updated });
    setEditingDestination(null);
    setEditingIndex(null);
  };

  const handleRemoveDestination = (index, e) => {
    e.stopPropagation();
    const updated = formData.triageRoutes.filter((_, i) => i !== index);
    updateFormData({ triageRoutes: updated });
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">

        {/* Add Destination Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleAddUrlDestination}
            className="flex-1 py-3 px-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-teal-500 hover:text-teal-400 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {t('addUrlDestination')}
          </button>
          <button
            type="button"
            onClick={handleRedirectToBot}
            className="flex-1 py-3 px-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {t('redirectToBot')}
          </button>
        </div>

        {/* Added Destinations List */}
        {formData.triageRoutes?.length > 0 && (
          <div className="space-y-3">
            {formData.triageRoutes.map((destination, index) => (
              <div
                key={destination.deploymentId || index}
                onClick={() => handleEditDestination(destination, index)}
                className="w-full text-left p-4 rounded-lg transition group border border-gray-700 bg-gray-700 hover:border-teal-500 hover:bg-teal-900/20 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-indigo-900/50 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-100">{destination.name} <span className="rounded bg-gray-600 text-xs p-1 ml-1 text-gray-300">{destination.deploymentId}</span></h4>
                      <p className="text-sm text-gray-500 truncate max-w-xs">{destination.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveDestination(index, e)}
                    aria-label={tTriage('deleteDestination')}
                    title={tTriage('deleteDestination')}
                    className="text-gray-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error display */}
        {errors.triageRoutes && (
          <p className="text-sm text-red-400">{errors.triageRoutes}</p>
        )}
      </div>

      {/* URL Destination Modal (Add) */}
      {showUrlModal && (
        <AddUrlDestinationWorkflow
          onClose={() => setShowUrlModal(false)}
          onAddDestination={handleUrlModalAdd}
        />
      )}

      {/* Bot Destination Modal (Add) */}
      {showBotModal && (
        <AddTriageDestinationWorkflow
          onClose={() => setShowBotModal(false)}
          onAddDestination={handleBotModalAdd}
        />
      )}

      {/* Edit Destination Modal */}
      {editingDestination && (
        <EditTriageDestinationWorkflow
          destination={editingDestination}
          onClose={() => {
            setEditingDestination(null);
            setEditingIndex(null);
          }}
          onUpdateDestination={handleUpdateDestination}
        />
      )}
    </WizardStep>
  );
}
