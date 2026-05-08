'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import AddAppointmentWorkflow from '../workflows/AddAppointmentWorkflow';
import EditAppointmentWorkflow from '../workflows/EditAppointmentWorkflow';

export default function AppointmentsConfig({ stepConfig, isEditMode = false }) {
  const t = useTranslations('wizard.modular');
  const tAppts = useTranslations('wizard.appointments');
  const { formData, updateFormData, errors } = useModularWizard();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);

  void isEditMode;

  const handleAddAppointment = () => {
    setShowAddModal(true);
  };

  const handleModalAdd = (appointment) => {
    const newDestinations = [...(formData.appointmentDestinations || []), appointment];
    updateFormData({ appointmentDestinations: newDestinations });
    setShowAddModal(false);
  };

  const handleEditAppointment = (appointment, index) => {
    setEditingAppointment(appointment);
    setEditingIndex(index);
  };

  const handleUpdateAppointment = (updatedAppointment) => {
    const updated = [...(formData.appointmentDestinations || [])];
    updated[editingIndex] = { ...updated[editingIndex], ...updatedAppointment };
    updateFormData({ appointmentDestinations: updated });
    setEditingAppointment(null);
    setEditingIndex(null);
  };

  const handleRemoveAppointment = (index, e) => {
    e.stopPropagation();
    const updated = formData.appointmentDestinations.filter((_, i) => i !== index);
    updateFormData({ appointmentDestinations: updated });
  };

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">

        {/* Add Appointment Button */}
        <button
          type="button"
          onClick={handleAddAppointment}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-teal-500 hover:text-teal-400 transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('addCalendarProvider')}
        </button>

        {/* Added Appointments List */}
        {formData.appointmentDestinations?.length > 0 && (
          <div className="space-y-3">
            {formData.appointmentDestinations.map((appointment, index) => (
              <div
                key={appointment.id || index}
                onClick={() => handleEditAppointment(appointment, index)}
                className="w-full text-left p-4 rounded-lg transition group border border-gray-700 bg-gray-700 hover:border-teal-500 hover:bg-teal-900/20 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-teal-900/50 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-100">{appointment.id} <span className="rounded bg-gray-600 text-xs p-1 ml-1 text-gray-300">{appointment.provider} </span></h4>
                      <p className="text-sm text-gray-500 truncate max-w-xs">{appointment.description}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveAppointment(index, e)}
                    aria-label={tAppts('deleteAppointment')}
                    title={tAppts('deleteAppointment')}
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
        {errors.appointmentDestinations && (
          <p className="text-sm text-red-400">{errors.appointmentDestinations}</p>
        )}
      </div>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <AddAppointmentWorkflow
          onClose={() => setShowAddModal(false)}
          existingIds={(formData.appointmentDestinations || []).map(a => a.id)}
          onAddAppointment={handleModalAdd}
        />
      )}

      {/* Edit Appointment Modal */}
      {editingAppointment && (
        <EditAppointmentWorkflow
          appointment={editingAppointment}
          onClose={() => {
            setEditingAppointment(null);
            setEditingIndex(null);
          }}
          onUpdateAppointment={handleUpdateAppointment}
        />
      )}
    </WizardStep>
  );
}
