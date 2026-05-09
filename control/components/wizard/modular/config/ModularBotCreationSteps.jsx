/**
 * Base step configurations for the modular wizard
 * Dynamic steps (knowledge, form-gathering, appointments) are added based on enabled protocols
 *
 * Translation keys:
 * - sectionKey: maps to wizard.steps.{key}
 * - titleKey: maps to wizard.titles.{key}
 */

export const MODULAR_BASE_STEPS = {
  core: {
    id: 'core',
    number: 1,
    sectionKey: 'botSetup',
    titleKey: 'configureYourBot',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  protocols: {
    id: 'protocols',
    number: 2,
    sectionKey: 'capabilities',
    titleKey: 'selectBotCapabilities',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  identity: {
    id: 'identity',
    number: 3,
    sectionKey: 'identity',
    titleKey: 'defineBotIdentity',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  knowledge: {
    id: 'knowledge',
    sectionKey: 'knowledge',
    titleKey: 'uploadKnowledgeBase',
    protocol: 'knowledge',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  'form-gathering': {
    id: 'form-gathering',
    sectionKey: 'formCollection',
    titleKey: 'configureFormCollection',
    protocol: 'formGathering',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  appointments: {
    id: 'appointments',
    sectionKey: 'appointments',
    titleKey: 'configureAppointments',
    protocol: 'appointments',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  triage: {
    id: 'triage',
    sectionKey: 'routing',
    titleKey: 'configureTriageRouting',
    protocol: 'triage',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  'optical-read': {
    id: 'optical-read',
    sectionKey: 'opticalRead',
    titleKey: 'configureOpticalRead',
    protocol: 'opticalRead',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v4a1 1 0 001 1h3m10-5v4a1 1 0 01-1 1h-3M3 17v-4a1 1 0 011-1h3m10 5v-4a1 1 0 00-1-1h-3M9 11a3 3 0 116 0 3 3 0 01-6 0z" />
      </svg>
    ),
  },
  deploy: {
    id: 'deploy',
    sectionKey: 'deploy',
    titleKey: 'deployYourBot',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
};

/**
 * Generate step configurations based on enabled protocols
 * @param {Object} enabledProtocols - { knowledge: bool, formGathering: bool, appointments: bool }
 * @returns {Array} Array of step configurations with correct numbers
 */
export function generateStepConfigs(enabledProtocols) {
  const configs = [
    { ...MODULAR_BASE_STEPS.core },
    { ...MODULAR_BASE_STEPS.protocols },
    { ...MODULAR_BASE_STEPS.identity },
  ];

  let stepNumber = 4;

  if (enabledProtocols.knowledge) {
    configs.push({ ...MODULAR_BASE_STEPS.knowledge, number: stepNumber++ });
  }

  if (enabledProtocols.formGathering) {
    configs.push({ ...MODULAR_BASE_STEPS['form-gathering'], number: stepNumber++ });
  }

  if (enabledProtocols.appointments) {
    configs.push({ ...MODULAR_BASE_STEPS.appointments, number: stepNumber++ });
  }

  if (enabledProtocols.triage) {
    configs.push({ ...MODULAR_BASE_STEPS.triage, number: stepNumber++ });
  }

  if (enabledProtocols.opticalRead) {
    configs.push({ ...MODULAR_BASE_STEPS['optical-read'], number: stepNumber++ });
  }

  configs.push({ ...MODULAR_BASE_STEPS.deploy, number: stepNumber });

  return configs;
}

/**
 * Get step config by ID
 * @param {string} stepId - Step identifier
 * @returns {Object} Step configuration
 */
export function getStepConfig(stepId) {
  return MODULAR_BASE_STEPS[stepId] || null;
}
