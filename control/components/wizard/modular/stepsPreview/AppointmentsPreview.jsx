'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import Image from 'next/image';
import './preview.css';

export default function AppointmentsPreview({ activeTab = 'desktop' }) {
  const t = useTranslations('wizard.previews.appointments');
  const { formData } = useModularWizard();

  const appointments = formData.appointmentDestinations || [];
  const botName = formData.botName || t('fallbackBotName');

  if (activeTab === 'desktop') {
    return (
      <div className="triage-bg">
        {appointments.length === 0 ? (
          // Empty/neutral state
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">{t('noProviders')}</p>
            <p className="text-xs mt-1">{t('noProvidersHint')}</p>
          </div>
        ) : (
          // Appointments topology diagram
          <div className="p-6 flex items-center justify-center h-full">
            <div className="flex items-center gap-3">
              {/* User Query */}
              <div className="flex flex-col items-center">
                <div className="text-xs text-gray-500 mb-1">{t('userQuery')}</div>
              </div>

              {/* Horizontal line to bot */}
              <div className="w-8 h-0.5 bg-gray-300" />

              {/* Bot Name Box */}
              <div className="px-4 py-2 bg-purple-100 border border-purple-300 rounded-lg">
                <span className="font-medium text-purple-800 text-sm whitespace-nowrap">{botName}</span>
              </div>

              {/* Arrow */}
              <div className="flex items-center">
                <div className="w-6 h-0.5 bg-gray-300" />
                <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-gray-300" />
              </div>

              {/* Calendars section */}
              <div className="relative ml-2">
                {/* Vertical line */}
                <div
                  className="absolute left-0 w-0.5 bg-gray-300"
                  style={{
                    top: appointments.length === 1 ? '50%' : '12px',
                    bottom: appointments.length === 1 ? '50%' : '12px'
                  }}
                />

                {/* Appointments */}
                <div className="space-y-9 pl-6">
                  {appointments.map((appointment, index) => (
                    <div
                      key={appointment.id || index}
                      className="relative flex items-center"
                    >
                      {/* Horizontal connector line */}
                      <div className="absolute left-[-24px] w-6 h-0.5 bg-gray-300" />

                      {/* Appointment card */}
                      <div className="flex p-2 px-3 bg-white border border-gray-200 rounded-lg shadow-sm gap-2 items-center">
                        {/* Calendar icon */}
                        {appointment.provider === 'calendly' && <Image src={`/images/calendlyicon.png`} alt={t('calendarIconAlt')} width={16} height={16} />}
                        <span className="font-medium text-gray-900 text-sm whitespace-nowrap">{appointment.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
