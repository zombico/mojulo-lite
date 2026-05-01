/**
 * Response format builder using text-based attribute descriptions
 * Composes response format section with inline descriptions per attribute
 */

/**
 * Core response attributes (always included)
 */
const CORE_ATTRIBUTES = {
  answer: '',
  suggestions: '[3 MAX]',
};

/**
 * Form gathering response attributes
 */
const FORM_GATHERING_ATTRIBUTES = {
  formTracker: '{\n        "dataInput1": "",\n        ...\n    }',
  formSuggestions: '[...]',
  fieldsRemaining: 'number of remaining fields',
  isComplete: 'true/false',
  suggestions: ''
};

/**
 * Appointments response attributes
 */
const APPOINTMENTS_ATTRIBUTES = {
  showCalendarLaunchButton: 'true/false',
  calendarId: '',
};

/**
 * Triage response attributes
 */
const TRIAGE_ATTRIBUTES = {
  // "triage": true,
  //   "deploymentId": "",
  //   "starterPrompt": ""
  triage: 'true/false',
  deploymentId: '',
  starterPrompt: 'string to prime triage bot',
  suggestions: '',
};

/**
 * Builds a JSON template string with inline text descriptions
 * @param {Object} attributes - Map of attribute name to description
 * @returns {string} - JSON template with descriptions as values
 */
function buildInlineTemplate(attributes) {
  const lines = Object.entries(attributes)
    .map(([key, value]) => {
      // Don't quote values that start with { or [ (objects/arrays)
      if (value.startsWith('{') || value.startsWith('[')) {
        return `    "${key}": ${value}`;
      }
      return `    "${key}": "${value}"`;
    })
    .join(',\n');

  return `{\n${lines}\n}`;
}

/**
 * Builds the response format section based on enabled protocols
 * @param {Object} enabledProtocols - { knowledge: bool, formGathering: bool, appointments: bool, triage: bool }
 * @returns {Promise<string>} - Response format protocol text
 */
async function buildResponseFormatSection(enabledProtocols) {
  // Start with core attributes
  const attributes = { ...CORE_ATTRIBUTES };

  // Add protocol-specific attributes
  if (enabledProtocols.formGathering) {
    Object.assign(attributes, FORM_GATHERING_ATTRIBUTES);
  }
  if (enabledProtocols.appointments) {
    Object.assign(attributes, APPOINTMENTS_ATTRIBUTES);
  }
  if (enabledProtocols.triage) {
    Object.assign(attributes, TRIAGE_ATTRIBUTES);
  }

  const jsonTemplate = buildInlineTemplate(attributes);

  return `## RESPONSE FORMAT PROTOCOL
RESPOND ONLY IN VALID JSON.
DO NOT INCLUDE ANY TEXT BEFORE OR AFTER THE JSON OBJECT
SEND ONLY ONE JSON BACK
## DO NOT OUTPUT ANYTHING BEFORE OR AFTER THE JSON
${jsonTemplate}`;
}

export {
  buildResponseFormatSection,
  CORE_ATTRIBUTES,
  FORM_GATHERING_ATTRIBUTES,
  APPOINTMENTS_ATTRIBUTES,
  TRIAGE_ATTRIBUTES,
};  