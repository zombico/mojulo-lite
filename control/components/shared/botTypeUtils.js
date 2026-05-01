/**
 * Bot Type Utilities
 *
 * Helpers for determining and displaying bot types
 */

/**
 * Determine bot type from deployment config or route data
 * @param {Object} data - Deployment config or route object
 * @returns {string} - Bot type: 'form', 'triage', 'appointments', or 'conversational'
 */
export function getBotType(data) {
  // Check if botType is explicitly stored
  if (data?.botType) return data.botType;

  // Check config object if present
  const config = data?.config || data;

  // Check for modular paradigm with enabledProtocols
  const enabledProtocols = config?._modular?.enabledProtocols;
  if (enabledProtocols) {
    // Priority order: triage > appointments > formGathering > knowledge
    if (enabledProtocols.triage) return 'triage';
    if (enabledProtocols.appointments) return 'appointments';
    if (enabledProtocols.formGathering) return 'form';
    if (enabledProtocols.knowledge) return 'conversational';
  }

  // Legacy fallback: check config fields directly
  // Has form structure -> form bot
  if (config?.formStructure) return 'form';

  // Has triage destinations -> triage bot
  if (config?.triageDestinations?.length > 0) return 'triage';

  // Has appointment destinations -> appointments bot
  if (config?.appointmentDestinations?.length > 0) return 'appointments';

  // Default to conversational
  return 'conversational';
}

/**
 * Get display label for bot type
 * @param {string} botType - The bot type
 * @returns {string} - Human-readable label
 */
export function getBotTypeLabel(botType) {
  switch (botType) {
    case 'form':
      return 'Form';
    case 'triage':
      return 'Triage';
    case 'appointments':
      return 'Appointments';
    case 'conversational':
    default:
      return 'Conversational';
  }
}

/**
 * Get Tailwind CSS classes for bot type badge
 * @param {string} botType - The bot type
 * @returns {string} - Tailwind CSS classes
 */
export function getBotTypeStyles(botType) {
  switch (botType) {
    case 'form':
      return 'bg-purple-100 text-purple-700';
    case 'triage':
      return 'bg-teal-100 text-teal-700';
    case 'appointments':
      return 'bg-violet-100 text-violet-700';
    case 'conversational':
    default:
      return 'bg-teal-100 text-teal-700';
  }
}

/**
 * Get Tailwind CSS classes for bot type circle indicator
 * @param {string} botType - The bot type
 * @returns {string} - Tailwind CSS classes for background color
 */
export function getBotTypeCircleColor(botType) {
  switch (botType) {
    case 'form':
      return 'bg-purple-500';
    case 'triage':
      return 'bg-teal-500';
    case 'appointments':
      return 'bg-violet-500';
    case 'conversational':
    default:
      return 'bg-teal-500';
  }
}

/**
 * Protocol definitions with icons and colors for modular bots
 */
export const PROTOCOL_CONFIG = {
  knowledge: {
    key: 'knowledge',
    label: 'Knowledge',
    color: 'text-blue-500',
    // Book/document icon for RAG knowledge base
    iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  formGathering: {
    key: 'formGathering',
    label: 'Form',
    color: 'text-purple-500',
    // Clipboard/form icon
    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  appointments: {
    key: 'appointments',
    label: 'Appointments',
    color: 'text-green-500',
    // Calendar icon
    iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  triage: {
    key: 'triage',
    label: 'Triage',
    color: 'text-orange-500',
    // Sideways Y fork with dot on lit/selected upper path
    iconPath: 'M3 12h7l6-4h2M10 12l6 4',
    // Lighter orange dot at end of selected path
    circle: { cx: 19, cy: 8, r: 2, fill: '#fdba74' },
  },
};

/**
 * Get enabled protocols from a deployment
 * Handles both modular paradigm (with _modular.enabledProtocols) and legacy configs
 * @param {Object} data - Deployment object or config
 * @returns {string[]} - Array of enabled protocol keys
 */
export function getEnabledProtocols(data) {
  const config = data?.config || data;

  // Check for modular paradigm with explicit enabledProtocols
  const modularProtocols = config?._modular?.enabledProtocols;
  if (modularProtocols) {
    return Object.entries(modularProtocols)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
  }

  // Legacy fallback: infer protocols from config structure
  const protocols = [];

  // Knowledge base (RAG) - has embeddings or documents
  if (config?.ragSummary || config?.embeddingsDocumentId || config?.documentIds?.length > 0) {
    protocols.push('knowledge');
  }

  // Form gathering
  if (config?.formStructure) {
    protocols.push('formGathering');
  }

  // Appointments
  if (config?.appointmentDestinations?.length > 0) {
    protocols.push('appointments');
  }

  // Triage routing
  if (config?.triageDestinations?.length > 0) {
    protocols.push('triage');
  }

  // If no specific protocols detected, default to knowledge (basic chat)
  if (protocols.length === 0) {
    protocols.push('knowledge');
  }

  return protocols;
}

/**
 * Check if a deployment uses the modular paradigm
 * @param {Object} data - Deployment object or config
 * @returns {boolean}
 */
export function isModularBot(data) {
  const config = data?.config || data;
  return config?._modular?.paradigm === 'modular';
}
